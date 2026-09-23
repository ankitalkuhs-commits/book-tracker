"""Sprint 4F: the four editorial bot voices.

Every module in this package talks to `https://api.trackmyread.com` over HTTP and to
nothing else. **There is no database access anywhere in this package** — no ORM, no
driver, no engine, and nothing reads a connection string from the environment (E-5/E-7:
the repository is public, so a production database credential must never become an Actions
secret).
`tests/test_bot_content.py::TestPosting::test_bots_package_has_no_database_access`
enforces that, both by AST and by importing the package in a subprocess with the ORM
poisoned.
"""
