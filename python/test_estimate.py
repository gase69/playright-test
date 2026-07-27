"""
python/test_estimate.py
Unit tests for AWS RDS Pricing Calculator config validation & CLI parsing.
"""

import pytest

from generate_aws_rds_estimate import RdsEstimateConfig, get_timestamp_string


def test_rds_estimate_config_defaults():
    config = RdsEstimateConfig()
    assert config.engine == "PostgreSQL"
    assert config.region == "eu-central-1"
    assert config.instance_type == "db.r7g.xlarge"
    assert config.storage_type == "gp3"
    assert config.storage_gb == 50
    assert config.deployment == "Multi-AZ"
    assert config.utilization_value == 100
    assert config.utilization_unit == "%Utilized/Month"
    assert config.headed is False


def test_rds_estimate_config_validation():
    with pytest.raises(ValueError, match="Input should be greater than 0"):
        RdsEstimateConfig(storage_gb=0)

    with pytest.raises(ValueError, match="Input should be greater than 0"):
        RdsEstimateConfig(storage_gb=-10)


def test_utilization_bounds_validation():
    with pytest.raises(ValueError, match="Hours/Day cannot exceed 24"):
        RdsEstimateConfig(utilization_value=80, utilization_unit="Hours/Day")

    with pytest.raises(ValueError, match="%Utilized/Month cannot exceed 100%"):
        RdsEstimateConfig(utilization_value=120, utilization_unit="%Utilized/Month")




def test_timestamp_string_format():
    ts = get_timestamp_string()
    assert len(ts) == 19  # YYYY-MM-DD_HH-mm-ss
    assert "_" in ts
    assert ts.count("-") == 4
