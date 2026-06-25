# Use current Alpine Node image
FROM node:24-alpine

# Set the working directory to the project folder
WORKDIR /app

# Copy package files separately for better caching
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy all files from the project folder
COPY . .

# Expose the Amalfi Admin Desk Vite dev server port
EXPOSE 5175

# Default start command for the mobile-first booking desk
CMD ["npm", "run", "dev", "--", "--host"]
