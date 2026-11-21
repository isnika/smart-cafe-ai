class RecommendationDataUnavailable(RuntimeError):
    """The configured live recommendation data source cannot be reached."""


class RecommendationAuthorizationError(PermissionError):
    """The backend did not authorize the requested user profile."""

    def __init__(self, message: str, status_code: int = 403):
        super().__init__(message)
        self.status_code = status_code


class RecommendationSnapshotEmpty(RuntimeError):
    """A valid live snapshot contains no active products to recommend."""

    def __init__(self, message: str = "Backend recommendation snapshot rỗng."):
        super().__init__(message)
