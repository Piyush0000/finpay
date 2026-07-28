# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2026-07-29

### 🎉 Major Release - Complete Rewrite with TypeScript

### ✨ Added
- **Full TypeScript Support** - Complete type definitions and TypeScript source code
- **Automatic Retry Logic** - Exponential backoff retry mechanism for failed requests
- **Custom Error Classes** - Specific error types (AuthenticationError, ValidationError, NetworkError, RateLimitError, InsufficientFundsError)
- **Input Validation** - Automatic validation of email formats, amounts, and required fields
- **Event Emitter** - Real-time event streaming for transfer status updates
- **Request/Response Interceptors** - Built-in logging and debugging capabilities
- **Comprehensive Test Suite** - Full Jest test coverage with mocking
- **Build Pipeline** - TypeScript compilation, ESLint, Prettier configuration
- **Enhanced Documentation** - Improved JSDoc comments and detailed README
- **Webhook Event Handler** - Static method to verify and emit webhook events
- **Configuration Options** - Advanced configuration including timeout, retry settings, and logging toggle

### 🔄 Changed
- **Source Code** - Migrated from JavaScript to TypeScript
- **Error Handling** - Improved error messages with proper error types and stack traces
- **API Structure** - Better organized code with clear separation of concerns
- **Package Configuration** - Updated package.json with build scripts and development dependencies

### 🛠️ Developer Experience
- **Type Safety** - Full IDE support with autocomplete and type checking
- **Better Debugging** - Optional request/response logging for development
- **Testing** - Comprehensive test suite with coverage reporting
- **Code Quality** - ESLint and Prettier for consistent code style
- **Build Process** - Automated TypeScript compilation for distribution

### 📝 Documentation
- **Enhanced README** - Detailed usage examples and API reference
- **Changelog** - This file to track all changes
- **Type Definitions** - Generated `.d.ts` files for TypeScript users

### 🧪 Testing
- **Unit Tests** - Comprehensive test coverage for all methods
- **Integration Tests** - Mock API responses for testing
- **Error Scenarios** - Tests for various error conditions
- **Validation Tests** - Tests for input validation logic

### 📦 Build & Distribution
- **TypeScript Compilation** - Automated build process
- **Type Definitions** - Included in distribution for TypeScript users
- **Source Maps** - Generated for debugging
- **NPM Scripts** - Convenient commands for build, test, and lint

### 🚀 Performance
- **Retry Logic** - Automatic retry with exponential backoff improves reliability
- **Connection Reuse** - Axios instance management for better performance
- **Efficient Validation** - Early validation prevents unnecessary API calls

### 🔒 Security
- **Type Safety** - TypeScript prevents many runtime errors
- **Input Validation** - Protects against invalid data
- **Error Handling** - Proper error classification prevents information leakage

---

## [1.0.0] - 2026-07-19

### ✨ Initial Release
- Basic wallet operations (get, create, fund)
- Transfer functionality with idempotency
- Transaction history and status checking
- Webhook signature verification
- Sandbox simulation headers (delay, error)
- Basic error handling
- JavaScript implementation