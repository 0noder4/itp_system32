# System32

Web application for Job Fair's partners management.

## Quick Start

1. Copy `.env.example` to `.env` and configure your environment variables
2. Run the application with Docker Compose:

```bash
docker compose up -d
```

3. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000

## Services

- **Frontend**: Next.js application
- **Backend**: Django REST API
- **Database**: MySQL

## Requirements

- Docker and Docker Compose

## Production Deployment

For production deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

The project includes a GitHub Actions CI/CD pipeline that automatically:

- Runs tests on every push and pull request
- Builds and pushes Docker images to Docker Hub when code is merged to `main`
- Optionally deploys to production servers

## Documentation

For documentation please view itp_system32 plane project docs

## Team

Special thanks to the development team

- Patrycja Lubowiecka
- Dominika Zarzycka
- Norbert Roszkowski
