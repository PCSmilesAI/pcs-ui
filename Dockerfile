FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create data directory
RUN mkdir -p pcs_ai_data

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "production-server.js"]
