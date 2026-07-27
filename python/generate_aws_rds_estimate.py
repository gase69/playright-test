#!/usr/bin/env -S uv run --project python
"""
python/generate_aws_rds_estimate.py
Standalone Python CLI generator for AWS RDS Pricing Calculator estimates using Playwright.
"""

import asyncio
import re
from datetime import datetime
from pathlib import Path
from typing import Annotated

import typer
from playwright.async_api import Locator, Page, async_playwright
from pydantic import BaseModel, Field, field_validator
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

console = Console()

# Region map helper (matches TypeScript script)
REGION_MAP: dict[str, str] = {
    "eu-central-1": "Frankfurt",
    "us-east-1": "N. Virginia",
    "us-east-2": "Ohio",
    "us-west-1": "N. California",
    "us-west-2": "Oregon",
    "eu-west-1": "Ireland",
    "eu-west-2": "London",
    "eu-west-3": "Paris",
    "ap-southeast-1": "Singapore",
    "ap-southeast-2": "Sydney",
    "ap-northeast-1": "Tokyo",
    "sa-east-1": "São Paulo",
}

# Storage type map helper (matches TypeScript script)
STORAGE_MAP: dict[str, str] = {
    "gp3": "General Purpose SSD (gp3)",
    "gp2": "General Purpose SSD (gp2)",
    "io1": "Provisioned IOPS SSD (io1)",
    "io2": "Provisioned IOPS SSD (io2)",
    "magnetic": "Magnetic",
}


def get_timestamp_string() -> str:
    """Generate ISO-like date string for collision-free output filenames."""
    return datetime.now().strftime("%Y-%m-%d_%H-%M-%S")


class RdsEstimateConfig(BaseModel):
    """Pydantic model for AWS RDS estimate parameters."""

    engine: str = "PostgreSQL"
    region: str = "eu-central-1"
    instance_type: str = "db.r7g.xlarge"
    storage_type: str = "gp3"
    storage_gb: int = Field(default=50, gt=0)
    deployment: str = "Multi-AZ"
    license_model: str | None = None
    edition: str | None = None
    description: str | None = None
    name: str | None = None
    headed: bool = False
    out_csv: Path | None = None
    out_url: Path | None = None

    @field_validator("storage_gb")
    @classmethod
    def validate_storage(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("storage_gb must be greater than 0")
        return v


class RdsEstimateResult(BaseModel):
    """Pydantic model for generated estimate output."""

    monthly_cost: str = ""
    annual_cost: str = ""
    csv_path: Path | None = None
    share_url: str | None = None


async def wait_visible(locator: Locator, timeout: int = 5000) -> bool:
    """Wait for locator to become visible, returning False if timeout elapses."""
    try:
        await locator.wait_for(state="visible", timeout=timeout)
        return True
    except Exception:
        return False


async def assert_no_validation_errors(
    page: Page, context_desc: str, attempts: int = 5, interval_ms: int = 400
) -> None:
    """Check that the calculator does not present inline 'Invalid Selection' errors."""
    error_messages: list[str] = []
    for _ in range(attempts):
        loc = page.get_by_text(re.compile(r"invalid selection", re.IGNORECASE))
        error_messages = await loc.all_text_contents()
        if not error_messages:
            return
        await page.wait_for_timeout(interval_ms)

    clean_errors = " | ".join([e.strip() for e in error_messages if e.strip()])
    raise RuntimeError(
        f"AWS Pricing Calculator rejected configuration {context_desc}: {clean_errors}"
    )


async def select_dropdown_option(
    page: Page,
    field_label: str,
    desired_value: str,
    field_context: str,
    verify_after: bool = False,
) -> None:
    """Select an option from a labelled dropdown, with candidate fallback matching."""
    field = page.get_by_label(field_label, exact=True).first
    if not await wait_visible(field, 5000):
        return

    await field.click()
    await page.wait_for_timeout(300)

    base_target = re.sub(r"\s+Edition$", "", desired_value, flags=re.IGNORECASE).strip()

    candidate_locators = [
        page.get_by_role(
            "option", name=re.compile(f"^{re.escape(desired_value)}$", re.IGNORECASE)
        ).first,
        page.get_by_role(
            "option", name=re.compile(f"^{re.escape(base_target)}$", re.IGNORECASE)
        ).first,
        page.get_by_role("option", name=re.compile(re.escape(desired_value), re.IGNORECASE)).first,
        page.get_by_role("option", name=re.compile(re.escape(base_target), re.IGNORECASE)).first,
        page.get_by_role("option")
        .filter(has_text=re.compile(re.escape(base_target), re.IGNORECASE))
        .first,
    ]

    selected_option: Locator | None = None
    for cand in candidate_locators:
        if await wait_visible(cand, 1000):
            selected_option = cand
            break

    if not selected_option:
        try:
            available = await page.get_by_role("option").all_text_contents()
        except Exception:
            available = []
        try:
            await page.keyboard.press("Escape")
        except Exception:
            pass

        clean_options = ", ".join([s.strip() for s in available if s.strip()]) or "(none found)"
        raise ValueError(
            f'"{desired_value}" is not a valid {field_context} for current selection. '
            f"Available options: {clean_options}"
        )

    await selected_option.click()
    await page.wait_for_timeout(300)
    if verify_after:
        await assert_no_validation_errors(
            page, f'after selecting {field_context} = "{desired_value}"'
        )


async def run_estimate_generator(
    config: RdsEstimateConfig,
) -> RdsEstimateResult:
    """Execute the Playwright automation flow to generate AWS RDS estimate."""
    timestamp = get_timestamp_string()
    cwd = Path.cwd()
    project_root = cwd.parent if cwd.name == "python" else cwd

    out_csv = (
        config.out_csv
        or project_root / "test-results" / f"aws-rds-estimate-{timestamp}.csv"
    )
    out_url = (
        config.out_url or project_root / "test-results" / f"aws-rds-url-{timestamp}.txt"
    )
    region_search = REGION_MAP.get(config.region.lower(), config.region)
    storage_label = STORAGE_MAP.get(config.storage_type.lower(), config.storage_type)
    description_text = config.description or f"RDS {config.engine} - Production Database"
    estimate_title = config.name or f"RDS {config.engine} Production Estimate ({config.region})"

    console.print(
        Panel.fit(
            f"[bold cyan]AWS RDS ESTIMATE GENERATOR (Python)[/bold cyan]\n\n"
            f"[bold]Engine:[/bold] Amazon RDS for {config.engine}\n"
            f"[bold]Region:[/bold] {config.region} ({region_search})\n"
            f"[bold]Instance:[/bold] {config.instance_type}\n"
            f"[bold]Storage:[/bold] {config.storage_gb} GB ({storage_label})\n"
            f"[bold]Deployment:[/bold] {config.deployment}\n"
            + (f"[bold]License:[/bold] {config.license_model}\n" if config.license_model else "")
            + (f"[bold]Edition:[/bold] {config.edition}\n" if config.edition else "")
            + f"[bold]Description:[/bold] {description_text}\n"
            f"[bold]Estimate Name:[/bold] {estimate_title}\n"
            f"[bold]Mode:[/bold] {'Headed (Visible)' if config.headed else 'Headless'}\n"
            f"[bold]CSV Output:[/bold] {out_csv}\n"
            f"[bold]URL Output:[/bold] {out_url}",
            title="Configuration",
        )
    )

    result = RdsEstimateResult(csv_path=out_csv)

    async with async_playwright() as p:
        with console.status("[bold green]Launching browser and automating AWS Calculator..."):
            browser = await p.chromium.launch(headless=not config.headed)
            context = await browser.new_context()
            page = await context.new_page()

            try:

                async def dismiss_cookies():
                    await page.evaluate(
                        """() => {
                        const acceptBtn = document.getElementById('awsccc-cs-btn-a') || document.querySelector('button[aria-label*="Accept"]');
                        if (acceptBtn) acceptBtn.click();
                        const banner = document.getElementById('awsccc-sb-ux-c') || document.querySelector('.awsccc-sb-c');
                        if (banner) banner.remove();
                        // Remove sales chat popups and floating overlays
                        document.querySelectorAll('[class*="chat"], [class*="sales"], [id*="chat"], [id*="sales"], iframe[title*="chat"]').forEach(el => el.remove());
                        Array.from(document.querySelectorAll('div, section')).forEach(el => {
                            if (el.textContent && el.textContent.includes('sales representative')) {
                                el.remove();
                            }
                        });
                    }"""
                    )

                # 1. Open AWS Pricing Calculator homepage
                try:
                    await page.goto(
                        "https://calculator.aws/#/",
                        wait_until="networkidle",
                        timeout=30000,
                    )
                except Exception:
                    await page.wait_for_load_state("domcontentloaded")
                await dismiss_cookies()

                # 2. Click "Create estimate"
                create_btn = page.get_by_role(
                    "button", name=re.compile(r"create estimate", re.IGNORECASE)
                ).first
                await create_btn.click()

                # 3. Search for RDS Service
                search_input = (
                    page.get_by_placeholder(re.compile(r"search for a service", re.IGNORECASE))
                    .or_(page.get_by_placeholder(re.compile(r"search", re.IGNORECASE)))
                    .first
                )
                await search_input.fill(f"Amazon RDS for {config.engine}")
                await page.wait_for_timeout(500)

                # 4. Click "Configure"
                configure_btn = page.get_by_role(
                    "button", name=re.compile(r"configure", re.IGNORECASE)
                ).first
                await configure_btn.click()
                try:
                    await page.wait_for_load_state("networkidle", timeout=30000)
                except Exception:
                    pass
                await dismiss_cookies()

                # 5. Fill Description
                desc_input = page.get_by_placeholder("Enter a description for your estimate").first
                if await wait_visible(desc_input):
                    await desc_input.fill(description_text)

                # 6. Select Region
                region_dropdown = page.get_by_role(
                    "button", name=re.compile(r"choose a region", re.IGNORECASE)
                ).first
                if await wait_visible(region_dropdown, 5000):
                    await region_dropdown.click()
                    await page.wait_for_timeout(500)
                    region_opt = page.get_by_text(
                        re.compile(re.escape(region_search), re.IGNORECASE)
                    ).first
                    if await wait_visible(region_opt, 5000):
                        await region_opt.click()

                # 7. Select Instance Type
                instance_combo = (
                    page.get_by_role(
                        "combobox", name=re.compile(r"select an instance", re.IGNORECASE)
                    )
                    .or_(page.get_by_placeholder(re.compile(r"select an instance", re.IGNORECASE)))
                    .first
                )
                if await wait_visible(instance_combo, 5000):
                    await instance_combo.click()
                    clean_shape = re.sub(r"^db\.", "", config.instance_type)
                    await instance_combo.fill(clean_shape)
                    await page.wait_for_timeout(500)
                    matched_opt = page.get_by_text(
                        re.compile(re.escape(config.instance_type), re.IGNORECASE)
                    ).first
                    if await wait_visible(matched_opt, 5000):
                        await matched_opt.click()

                # 7.5. Select Deployment Option
                await select_dropdown_option(
                    page, "Deployment option", config.deployment, "deployment option"
                )

                # 7.6. Select License model
                if config.license_model:
                    await select_dropdown_option(
                        page, "License", config.license_model, "license model"
                    )

                # 7.7. Select Database edition
                if config.edition:
                    await select_dropdown_option(
                        page,
                        "Database edition",
                        config.edition,
                        "database edition",
                        verify_after=True,
                    )

                # 8. Select Storage Type & Amount
                storage_vol_dropdown = page.get_by_role(
                    "button",
                    name=re.compile(
                        r"general purpose ssd|provisioned iops ssd|magnetic",
                        re.IGNORECASE,
                    ),
                ).first
                if await wait_visible(storage_vol_dropdown, 5000):
                    await storage_vol_dropdown.click()
                    storage_opt = page.get_by_text(
                        re.compile(re.escape(storage_label), re.IGNORECASE)
                    ).first
                    if await wait_visible(storage_opt, 5000):
                        await storage_opt.click()

                storage_amt_input = (
                    page.get_by_role(
                        "spinbutton", name=re.compile(r"storage amount", re.IGNORECASE)
                    )
                    .or_(page.get_by_placeholder(re.compile(r"storage amount", re.IGNORECASE)))
                    .first
                )
                if await wait_visible(storage_amt_input, 5000):
                    await storage_amt_input.fill(str(config.storage_gb))

                # 9. Save and view summary
                await assert_no_validation_errors(page, "before saving the estimate")
                await dismiss_cookies()
                save_btn = page.get_by_role(
                    "button",
                    name=re.compile(
                        r"save and view summary|save and add to estimate",
                        re.IGNORECASE,
                    ),
                ).first
                await save_btn.click()

                # 10. Verify Redirection to Estimate Summary
                try:
                    await page.wait_for_load_state("networkidle", timeout=30000)
                except Exception:
                    pass

                # 11. Edit Estimate Title
                edit_link = (
                    page.get_by_role(
                        "link", name=re.compile(r"edit my estimate|edit", re.IGNORECASE)
                    )
                    .or_(page.get_by_text(re.compile(r"edit", re.IGNORECASE)))
                    .first
                )
                if await wait_visible(edit_link):
                    try:
                        await edit_link.click()
                    except Exception:
                        pass
                    title_input = page.get_by_role(
                        "textbox",
                        name=re.compile(r"enter name|estimate name", re.IGNORECASE),
                    ).first
                    if await wait_visible(title_input):
                        await title_input.fill(estimate_title)
                        save_title_btn = page.get_by_role(
                            "button", name=re.compile(r"^save$", re.IGNORECASE)
                        ).first
                        if await wait_visible(save_title_btn):
                            await save_title_btn.click()

                # Extract Cost Numbers
                try:
                    m_loc = page.get_by_text(
                        re.compile(r"Monthly cost", re.IGNORECASE)
                    ).first.locator("xpath=..")
                    result.monthly_cost = (await m_loc.text_content() or "").strip()
                except Exception:
                    pass

                try:
                    a_loc = page.get_by_text(
                        re.compile(r"Total 12 months cost", re.IGNORECASE)
                    ).first.locator("xpath=..")
                    result.annual_cost = (await a_loc.text_content() or "").strip()
                except Exception:
                    pass

                # 12. Export CSV
                export_btn = page.get_by_role(
                    "button", name=re.compile(r"export", re.IGNORECASE)
                ).first
                if await wait_visible(export_btn, 5000):
                    await export_btn.click()
                    await page.wait_for_timeout(500)

                    csv_opt = (
                        page.get_by_text(re.compile(r"^csv$", re.IGNORECASE))
                        .or_(page.get_by_role("menuitem", name=re.compile(r"csv", re.IGNORECASE)))
                        .first
                    )
                    if await wait_visible(csv_opt, 5000):
                        await csv_opt.click()
                        await page.wait_for_timeout(500)

                        ok_btn = page.get_by_role(
                            "button", name=re.compile(r"^ok$", re.IGNORECASE)
                        ).first
                        if await wait_visible(ok_btn, 5000):
                            async with page.expect_download(timeout=15000) as download_info:
                                await ok_btn.click()
                            download = await download_info.value
                            out_csv.parent.mkdir(parents=True, exist_ok=True)
                            await download.save_as(out_csv)

                # 13. Share & Extract Link
                await dismiss_cookies()
                share_btn = page.get_by_role(
                    "button", name=re.compile(r"share", re.IGNORECASE)
                ).first
                if await wait_visible(share_btn, 5000):
                    await share_btn.click()
                    await page.wait_for_timeout(1000)

                    agree_btn = (
                        page.get_by_role(
                            "button",
                            name=re.compile(r"agree and continue", re.IGNORECASE),
                        )
                        .or_(page.get_by_text(re.compile(r"agree and continue", re.IGNORECASE)))
                        .first
                    )
                    if await wait_visible(agree_btn, 5000):
                        await dismiss_cookies()
                        try:
                            await agree_btn.click(force=True)
                        except Exception:
                            await page.evaluate(
                                """() => {
                                const btns = Array.from(document.querySelectorAll('button'));
                                const agree = btns.find(b => b.textContent && /agree and continue/i.test(b.textContent));
                                if (agree) agree.click();
                            }"""
                            )
                        await page.wait_for_timeout(1500)

                    public_link_inputs = page.get_by_role(
                        "textbox",
                        name=re.compile(r"copy public link", re.IGNORECASE),
                    )
                    share_url = ""
                    for _ in range(10):
                        count = await public_link_inputs.count()
                        for i in range(count):
                            val = await public_link_inputs.nth(i).input_value()
                            if val:
                                share_url = val
                                break
                        if share_url:
                            break
                        await page.wait_for_timeout(500)

                    if share_url:
                        result.share_url = share_url
                        out_url.parent.mkdir(parents=True, exist_ok=True)
                        out_url.write_text(share_url)

            finally:
                await browser.close()

    return result


app = typer.Typer(
    name="aws-rds-estimate-py",
    help="AWS RDS Pricing Calculator estimate generator in Python",
    add_completion=False,
)


@app.command()
def main(
    engine: Annotated[str, typer.Option("--engine", "-e", help="Database engine")] = "PostgreSQL",
    region: Annotated[str, typer.Option("--region", "-r", help="AWS region code")] = "eu-central-1",
    instance_type: Annotated[
        str, typer.Option("--instance-type", "-i", help="RDS Instance class")
    ] = "db.r7g.xlarge",
    storage_type: Annotated[
        str, typer.Option("--storage-type", "-t", help="Storage type shape")
    ] = "gp3",
    storage_gb: Annotated[int, typer.Option("--storage-gb", "-s", help="Storage size in GB")] = 50,
    deployment: Annotated[
        str, typer.Option("--deployment", "-d", help="Single-AZ or Multi-AZ")
    ] = "Multi-AZ",
    license_model: Annotated[str | None, typer.Option("--license", help="License model")] = None,
    edition: Annotated[str | None, typer.Option("--edition", help="Database edition")] = None,
    description: Annotated[
        str | None, typer.Option("--description", help="Service description")
    ] = None,
    name: Annotated[str | None, typer.Option("--name", help="Estimate title name")] = None,
    headed: Annotated[
        bool, typer.Option("--headed", help="Run browser in visible window mode")
    ] = False,
    out_csv: Annotated[
        Path | None, typer.Option("--out-csv", "-c", help="CSV export destination")
    ] = None,
    out_url: Annotated[
        Path | None, typer.Option("--out-url", "-u", help="Share URL export destination")
    ] = None,
) -> None:
    """Run AWS RDS Pricing Calculator Estimate Generator."""
    try:
        config = RdsEstimateConfig(
            engine=engine,
            region=region,
            instance_type=instance_type,
            storage_type=storage_type,
            storage_gb=storage_gb,
            deployment=deployment,
            license_model=license_model,
            edition=edition,
            description=description,
            name=name,
            headed=headed,
            out_csv=out_csv,
            out_url=out_url,
        )
    except Exception as err:
        console.print(f"[bold red]❌ Configuration error:[/bold red] {err}")
        raise typer.Exit(code=1)

    try:
        result = asyncio.run(run_estimate_generator(config))
    except Exception as err:
        console.print(f"[bold red]❌ Automation error:[/bold red] {err}")
        raise typer.Exit(code=1)

    table = Table(title="AWS RDS Estimate Summary", show_header=True, header_style="bold magenta")
    table.add_column("Metric", style="cyan")
    table.add_column("Value", style="green")

    if result.monthly_cost:
        table.add_row("Monthly Cost", result.monthly_cost)
    if result.annual_cost:
        table.add_row("Annual Cost", result.annual_cost)
    if result.csv_path:
        table.add_row("CSV File", str(result.csv_path))
    if result.share_url:
        table.add_row("Public URL", result.share_url)

    console.print(table)


if __name__ == "__main__":
    app()
