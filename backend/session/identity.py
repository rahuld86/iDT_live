"""Session identity resolution (task 7.1).

Derives a stable session id from the authenticated JWT identity. The app issues
JWTs with ``identity=username`` (``create_access_token(identity=username)``) and
reads it back with ``get_jwt_identity()``. We map that identity to a single,
stable session id of the form ``user:{identity}`` so that every request from the
same user -- across workers -- addresses the same workspace.

See the ``session-state-isolation`` design: the session id is derived *solely*
from the authenticated identity, giving exactly **one workspace per user** with
no client-supplied value that could spawn a second concurrent workspace.
"""

from flask_jwt_extended import get_jwt_identity


def session_id_from_jwt() -> str:
    """Return a stable session id tied to the authenticated principal.

    Preconditions:  called inside a ``@jwt_required()`` endpoint (a valid JWT is
    present in the request context, so ``get_jwt_identity()`` returns the
    identity passed to ``create_access_token``).
    Postconditions: returns a non-empty, deterministic id ``"user:{identity}"``
    for the same identity. One workspace per user -- the id is derived directly
    from the authenticated identity, with no client-supplied component.
    """
    identity = get_jwt_identity()
    return f"user:{identity}"
