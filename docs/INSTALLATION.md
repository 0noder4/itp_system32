# ITP System32 Installation Guide

This guide provides step-by-step instructions for installing and setting up the ITP System32 application on your local machine or development environment.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Docker** (version 20.10 or higher)
- **Docker Compose** (version 2.0 or higher)
- **Git** (for cloning the repository)
- **Node.js** (version 22 or higher) - optional, for local frontend development
- **Python** (version 3.13 or higher) - optional, for local backend development
- **MySQL Client** - optional, for direct database access

### Verify Prerequisites

```bash
# Check Docker version
docker --version

# Check Docker Compose version
docker compose version

# Check Git version
git --version

# Check Node.js version (if installed)
node --version

# Check Python version (if installed)
python3 --version
```

## Quick Start with Docker

The easiest way to get started is using Docker Compose, which will set up all services automatically.

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/itp_system32.git
cd itp_system32
```

### 2. Create Environment File

Create a `.env` file in the root directory:

```bash
cp .env.example .env  # If you have a template
# OR create a new .env file manually
```

Edit the `.env` file with your configuration:

### 3. Start the Services

```bash
# Build and start all services
docker compose up -d

# Or build and start with logs visible
docker compose up --build
```

This will start:

- **MySQL Database** on port 3306
- **Django Backend** on port 8000
- **Next.js Frontend** on port 3000
- **Mailpit** (Email testing) on ports 8025 (web UI) and 1025 (SMTP)

### 4. Run Database Migrations

```bash
# Run migrations
docker compose exec backend python manage.py migrate

# Create a superuser (optional)
docker compose exec backend python manage.py createsuperuser
```

### 5. Verify Installation

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Django Admin**: http://localhost:8000/admin
- **Mailpit Web UI**: http://localhost:8025

## Configuration

### Database Configuration

The application uses MySQL by default. You can configure the database connection through environment variables:

- `DATABASE_ENGINE`: Database engine (mysql, sqlite3, etc.)
- `DATABASE_NAME`: Database name
- `DATABASE_USER`: Database username
- `DATABASE_PASSWORD`: Database password
- `DATABASE_HOST`: Database host (use `db` for Docker, `localhost` for local)
- `DATABASE_PORT`: Database port (default: 3306)

### Django Settings

Key Django configuration options:

- `DJANGO_SECRET_KEY`: Secret key for cryptographic signing (required)
- `DEBUG`: Enable/disable debug mode (True for development, False for production)
- `DJANGO_ALLOWED_HOSTS`: Comma-separated list of allowed hosts
- `DJANGO_LOGLEVEL`: Logging level (DEBUG, INFO, WARNING, ERROR)

### Email Configuration

For development, Mailpit is configured by default:

- `EMAIL_HOST`: mailpit (Docker) or localhost (local)
- `EMAIL_PORT`: 1025 (SMTP)
- Mailpit Web UI: http://localhost:8025

For production, configure your SMTP server:

- `EMAIL_HOST`: Your SMTP server
- `EMAIL_PORT`: SMTP port (usually 587 for TLS, 465 for SSL)
- `EMAIL_HOST_USER`: SMTP username
- `EMAIL_HOST_PASSWORD`: SMTP password
- `EMAIL_USE_SSL`: Enable SSL (True/False)

## 🐳 Docker Commands

### Basic Commands

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# View logs
docker compose logs -f

# View logs for specific service
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db

# Rebuild containers
docker compose up -d --build

# Stop and remove all containers, networks, and volumes
docker compose down -v
```

### Database Commands

```bash
# Run migrations
docker compose exec backend python manage.py migrate

# Create superuser
docker compose exec backend python manage.py createsuperuser

# Access database shell
docker compose exec db mysql -u itp_user -p itp_system32_db

# Create database backup
docker compose exec db mysqldump -u itp_user -p itp_system32_db > backup.sql
```

### Backend Commands

```bash
# Access Django shell
docker compose exec backend python manage.py shell

# Collect static files
docker compose exec backend python manage.py collectstatic --noinput

# Create a new Django app
docker compose exec backend python manage.py startapp app_name

# Run Django tests
docker compose exec backend python manage.py test
```

### Frontend Commands

```bash
# Install new npm package
docker compose exec frontend npm install package_name

# Build for production
docker compose exec frontend npm run build

# Run tests (if configured)
docker compose exec frontend npm test
```

## 🔍 Troubleshooting

### Common Issues

#### 1. Port Already in Use

If you get an error that a port is already in use:

```bash
# Check what's using the port
sudo lsof -i :8000  # For backend
sudo lsof -i :3000  # For frontend
sudo lsof -i :3306  # For database

# Kill the process or change the port in compose.yml
```

#### 2. Database Connection Failed

- Verify database credentials in `.env`
- Check if database container is running: `docker compose ps`
- Check database logs: `docker compose logs db`
- Ensure database is initialized: `docker compose exec backend python manage.py migrate`

#### 3. Docker Build Fails

- Check Docker and Docker Compose versions
- Ensure you have enough disk space: `docker system df`
- Clear Docker cache: `docker system prune -a`
- Rebuild without cache: `docker compose build --no-cache`

#### 4. Permission Issues

```bash
# Fix file permissions
sudo chown -R $USER:$USER .

# Fix Docker socket permissions (Linux)
sudo usermod -aG docker $USER
# Log out and log back in
```

#### 5. Frontend Not Connecting to Backend

- Verify `NEXT_PUBLIC_API_URL` in `.env` or `.env.local`
- Check CORS settings in Django settings
- Ensure backend is running and accessible
- Check browser console for CORS errors

#### 6. Migrations Not Running

```bash
# Check migration status
docker compose exec backend python manage.py showmigrations

# Reset migrations (WARNING: This will delete data)
docker compose exec backend python manage.py migrate --fake-initial
```

### Getting Help

1. Check the logs: `docker compose logs -f`
2. Verify environment variables: `docker compose config`
3. Check container status: `docker compose ps`
4. Review the [DEPLOYMENT.md](./DEPLOYMENT.md) guide
5. Check GitHub Issues for known problems

## Next Steps

After installation:

1. Read the [DEVELOPMENT.md](./DEVELOPMENT.md) guide for development workflows
2. Access the Django admin at http://localhost:8000/admin/
3. Check out the frontend at http://localhost:3000

## ecurity Notes

**Important Security Considerations**:

1. **Never commit `.env` files** to version control
2. **Change default passwords** in production
3. **Use strong SECRET_KEY** for Django
4. **Enable HTTPS** in production
5. **Restrict ALLOWED_HOSTS** in production
6. **Set DEBUG=False** in production
7. **Use environment-specific configurations**
8. **Regularly update dependencies**

## 📖 Additional Resources

- [Django Documentation](https://docs.djangoproject.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [MySQL Documentation](https://dev.mysql.com/doc/)
