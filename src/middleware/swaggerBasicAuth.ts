import { Request, Response, NextFunction } from 'express';

const SWAGGER_USER = process.env.SWAGGER_USER || '';
const SWAGGER_PASS = process.env.SWAGGER_PASS || '';

export const swaggerBasicAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Swagger UI"');
    res.status(401).send('Authentication required');
    return;
  }

  const base64Credentials = authHeader.split(' ')[1] || '';
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
  const separatorIndex = credentials.indexOf(':');

  if (separatorIndex === -1) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Swagger UI"');
    res.status(401).send('Invalid authentication header');
    return;
  }

  const username = credentials.slice(0, separatorIndex);
  const password = credentials.slice(separatorIndex + 1);

  if (!SWAGGER_USER || !SWAGGER_PASS || username !== SWAGGER_USER || password !== SWAGGER_PASS) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Swagger UI"');
    res.status(401).send('Invalid credentials');
    return;
  }

  next();
};
