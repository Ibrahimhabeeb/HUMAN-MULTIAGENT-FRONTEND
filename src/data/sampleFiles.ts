// The shape of one file in the project. An `interface` lists an object's fields
// and their types, so TypeScript can warn us if we use a file the wrong way.
export interface ProjectFile {
  path: string
  content: string
}

// The files the app starts with.
export const SAMPLE_FILES: ProjectFile[] = [
  {
    path: 'README.md',
    content: `# Task: User Login

Implement a user registration and login feature.

## Requirements
- Users register with a username and password
- Users log in with their username and password
- Passwords must never be stored in plain text
`,
  },
  {
    path: 'main.py',
    content: `from app.auth import login


def main():
    username = input("Username: ")
    password = input("Password: ")
    print(login(username, password))


if __name__ == "__main__":
    main()
`,
  },
  {
    path: 'app/auth.py',
    content: `import hashlib

USERS = {"alice": hashlib.md5(b"wonderland").hexdigest()}


def login(username, password):
    if username not in USERS:
        return "No account found for that username"
    if USERS[username] != hashlib.md5(password.encode()).hexdigest():
        return "Incorrect password"
    return "Login successful"
`,
  },
  {
    path: 'app/config.py',
    content: `SECRET_KEY = "super-secret-key-123"
DEBUG = True
`,
  },
  {
    path: 'requirements.txt',
    content: `pytest
`,
  },
]
