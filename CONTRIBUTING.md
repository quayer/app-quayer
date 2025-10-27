# Contributing to Quayer

Thank you for your interest in contributing to Quayer! This document provides guidelines and instructions for contributing.

## 📖 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)

## 🤝 Code of Conduct

This project adheres to a Code of Conduct. By participating, you are expected to uphold this code.

## 🚀 Getting Started

### Prerequisites

- Node.js 22+
- Docker & Docker Compose
- Git configured with SSH

### Setup

1. **Fork the repository**

2. **Clone your fork**
   ```bash
   git clone git@github.com:YOUR_USERNAME/app-quayer.git
   cd app-quayer
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Setup environment**
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

5. **Start services**
   ```bash
   docker-compose up -d
   npm run db:push
   npm run db:seed
   ```

6. **Run development server**
   ```bash
   npm run dev
   ```

## 💻 Development Workflow

### Branch Strategy

- `main` - Production-ready code
- `develop` - Development branch
- `feature/*` - New features
- `fix/*` - Bug fixes
- `hotfix/*` - Urgent production fixes

### Creating a Feature Branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name
```

## 📝 Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/).

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `ci`: CI/CD changes

### Examples

```bash
feat(auth): add Google OAuth integration

fix(instances): resolve QR Code generation timeout

docs(readme): update installation instructions

test(api): add unit tests for phone validator
```

## 🔄 Pull Request Process

### Before Submitting

✅ **Read** [docs/APRENDIZADOS_E_SOLUCOES.md](./docs/APRENDIZADOS_E_SOLUCOES.md)

✅ **Run the full test suite**
```bash
npm run test:ci
```

✅ **Ensure code quality**
```bash
npm run lint
npm run build
```

✅ **Update documentation** if needed

### PR Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] All tests passing
- [ ] No merge conflicts
- [ ] Linked related issues

### PR Title Format

Follow the same format as commit messages:

```
feat(scope): description
```

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Related Issues
Closes #123

## Testing
Describe testing done

## Screenshots (if applicable)

## Checklist
- [ ] Tests pass locally
- [ ] Code follows style guidelines
- [ ] Documentation updated
```

## 🎨 Coding Standards

### TypeScript

- Use TypeScript strict mode
- No `any` types (use `unknown` if necessary)
- Proper type definitions for all functions
- Use interfaces over type aliases for objects

### File Structure

```
src/
├── app/              # Next.js pages
├── components/       # React components
├── features/         # Feature modules (Igniter.js)
├── lib/             # Utilities and helpers
├── hooks/           # Custom React hooks
└── types/           # TypeScript type definitions
```

### Naming Conventions

- **Files**: `kebab-case.ts`
- **Components**: `PascalCase.tsx`
- **Functions**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Types/Interfaces**: `PascalCase`

### Code Style

- Use 2 spaces for indentation
- Max line length: 100 characters
- Use single quotes for strings
- Always use semicolons
- Trailing commas in multi-line objects/arrays

### Example

```typescript
// ✅ Good
interface UserProfile {
  id: string;
  name: string;
  email: string;
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error('User not found');
  }
  return user;
}

// ❌ Bad
async function getUser(id: any) {
  const user = await db.user.findUnique({ where: { id: id } })
  return user
}
```

## 🧪 Testing

### Run Tests

```bash
# Unit tests
npm run test:unit

# API tests
npm run test:api

# E2E tests
npm run test:e2e

# All tests
npm run test:all
```

### Writing Tests

- **Unit tests** for utilities and helpers
- **API tests** for endpoints
- **E2E tests** for critical user flows

### Test Structure

```typescript
describe('Feature Name', () => {
  describe('Function Name', () => {
    it('should do something expected', () => {
      // Arrange
      const input = 'test'

      // Act
      const result = myFunction(input)

      // Assert
      expect(result).toBe('expected')
    })
  })
})
```

## 📚 Additional Resources

- [Igniter.js Documentation](https://igniterjs.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Project README](./README.md)
- [Knowledge Base](./docs/APRENDIZADOS_E_SOLUCOES.md)

## ❓ Questions?

If you have questions:

1. Check existing [GitHub Issues](https://github.com/Quayer/app-quayer/issues)
2. Review [documentation](./docs/)
3. Create a new issue with the `question` label

## 🙏 Thank You!

Your contributions make this project better for everyone. We appreciate your time and effort!

---

**Happy Coding! 🚀**
