# ITP System32 Development Guide

This guide provides information for developers working on the ITP System32 project, including development workflows, coding standards, and best practices.

## Project Structure

```
itp_system32/
├── backend/                 # Django backend application
│   ├── backend/            # Django project settings
│   │   ├── settings.py     # Main settings file
│   │   ├── urls.py         # URL configuration
│   │   └── wsgi.py         # WSGI configuration
│   ├── companies/          # Companies app
│   ├── users/              # Users app
│   ├── manage.py           # Django management script
│   ├── requirements.txt    # Python dependencies
│   ├── Dockerfile          # Docker configuration
│   └── docker-entrypoint.sh # Docker entrypoint script
├── frontend/               # Next.js frontend application
│   ├── app/                # Next.js app directory
│   ├── components/         # React components
│   ├── lib/                # Utility libraries
│   ├── public/             # Static assets
│   ├── package.json        # Node.js dependencies
│   └── Dockerfile          # Docker configuration
├── docs/                   # Documentation
│   ├── INSTALLATION.md     # Installation guide
│   ├── DEVELOPMENT.md      # This file
│   └── DEPLOYMENT.md       # Deployment guide
├── scripts/                # Utility scripts
├── compose.yml             # Docker Compose configuration
└── README.md               # Project overview
```

## Development Workflow

### Starting Development Environment

1. **Clone the repository** (if you haven't already):

   ```bash
   git clone https://github.com/your-username/itp_system32.git
   cd itp_system32
   ```

2. **Set up environment variables**:

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start the development environment**:

   ```bash
   docker compose up -d
   ```

4. **Run database migrations**:

   ```bash
   docker compose exec backend python manage.py migrate
   ```

5. **Create a superuser** (if needed):
   ```bash
   docker compose exec backend python manage.py createsuperuser
   ```

### Development Mode

The development environment is configured with:

- **Hot reload** for both frontend and backend
- **Debug mode** enabled in Django
- **Development tools** installed (django-debug-toolbar, ipdb, etc.)
- **Mailpit** for email testing
- **Volume mounts** for live code changes

#### Backend Changes

1. **Create a new Django app**:

   ```bash
   docker compose exec backend python manage.py startapp app_name
   ```

2. **Create models and migrations**:

   ```bash
   # After modifying models.py
   docker compose exec backend python manage.py makemigrations
   docker compose exec backend python manage.py migrate
   ```

3. **Create API endpoints**:

   - Add views in `apps/views.py`
   - Add serializers in `apps/serializers.py`
   - Register URLs in `apps/urls.py`
   - Include in main `backend/urls.py`

## Backend Debugging

1. **Django Debug Toolbar**:

   - Available in development mode
   - Access at http://localhost:8000
   - Shows SQL queries, templates, etc.

2. **Django Shell**:

   ```bash
   docker compose exec backend python manage.py shell
   ```

3. **View Logs**:
   ```bash
   docker compose logs -f backend
   ```

## Git Workflow

### Branching Strategy

- **main**: Production-ready code
- **develop**: Development branch
- **feature/\***: Feature branches
- **bugfix/\***: Bug fix branches
- **hotfix/\***: Hotfix branches

### Commit Messages

Follow conventional commits:

```
feat: add company creation endpoint
fix: resolve database connection issue
docs: update installation instructions
style: format code with black
refactor: reorganize API structure
test: add unit tests for companies
chore: update dependencies
```

### Pull Requests

1. **Create a feature branch**:

   ```bash
   git checkout -b feature/new-feature
   ```

2. **Make your changes** and commit:

   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

3. **Push to remote**:

   ```bash
   git push origin feature/new-feature
   ```

4. **Create a Pull Request** on GitHub
5. **Request review** from team members
6. **Address feedback** and update PR
7. **Merge** after approval

````

## Backend Dependency Management

1. **Add a new package**:

   ```bash
   docker compose exec backend pip install package_name
   docker compose exec backend pip freeze > requirements.txt
````

2. **Update dependencies**:
   ```bash
   docker compose exec backend pip install --upgrade package_name
   docker compose exec backend pip freeze > requirements.txt
   ```

## Email Testing

In development, emails are sent to Mailpit:

1. **Access Mailpit Web UI**: http://localhost:8025
2. **Username/Password**: configured in .env
3. **View emails** sent by the application
4. **Test email functionality** without sending real emails

## Useful Commands

### Backend

```bash
# Django shell
docker compose exec backend python manage.py shell

# Create superuser
docker compose exec backend python manage.py createsuperuser

# Collect static files
docker compose exec backend python manage.py collectstatic

# Check for issues
docker compose exec backend python manage.py check

# Show URLs
docker compose exec backend python manage.py show_urls
```

### Frontend

```bash
# Development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint

# Format code
npm run format
```

### Docker

```bash
# View logs
docker compose logs -f

# Restart services
docker compose restart

# Rebuild services
docker compose up -d --build

# Clean up
docker compose down -v
docker system prune -a
```

## 🐛 Common Issues & Solutions

### Issue: Changes not reflecting

**Solution**:

- Check if volumes are mounted correctly
- Restart the service: `docker compose restart backend`
- Clear browser cache

### Issue: Database migration errors

**Solution**:

- Check migration files for conflicts
- Reset migrations if needed (development only)
- Verify database connection

### Issue: CORS errors

**Solution**:

- Check `CORS_ALLOWED_ORIGINS` in Django settings
- Verify `NEXT_PUBLIC_API_URL` in frontend
- Check browser console for specific errors

### Issue: Port conflicts

**Solution**:

- Change ports in `compose.yml`
- Stop conflicting services
- Check what's using the port: `lsof -i :PORT`

## 📖 Additional Resources

- [Django Best Practices](https://docs.djangoproject.com/en/stable/misc/design-philosophies/)
- [Next.js Best Practices](https://nextjs.org/docs/app/building-your-application)
- [REST API Design](https://restfulapi.net/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React Patterns](https://reactpatterns.com/)

## 🤝 Contributing

1. Follow the coding standards
2. Write tests for new features
3. Update documentation
4. Create descriptive commit messages
5. Request code review before merging
6. Keep pull requests focused and small

## ❓ Getting Help

- Check the documentation in `/docs`
- Review existing code for patterns
- Ask questions in team chat
- Create an issue on GitHub
- Check Django/Next.js documentation
