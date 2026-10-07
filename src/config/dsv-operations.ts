import { apiConfig } from '../api/config';

// Activation is a build setting for isolated validation. It does not enable server sending.
export const operationsEnabled = apiConfig.mode === 'remote' && import.meta.env.VITE_DSV_OPERATIONS_ENABLED === 'true';
