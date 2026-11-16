class ForecastingError(Exception):
    """Base error for forecasting data and serving failures."""


class ForecastingDataUnavailable(ForecastingError):
    """The configured operational source cannot be reached or is not configured."""


class ForecastingDataQualityError(ForecastingError):
    """The source payload is reachable but cannot be safely used."""


class ForecastingBranchRequired(ForecastingError):
    """A branch is required to prevent cross-branch aggregation."""
