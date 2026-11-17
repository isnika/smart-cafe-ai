class RecommendationDataUnavailable(RuntimeError):
    """The configured live recommendation data source cannot be reached."""


class RecommendationAuthorizationError(PermissionError):
    """The backend did not authorize the requested user profile."""
