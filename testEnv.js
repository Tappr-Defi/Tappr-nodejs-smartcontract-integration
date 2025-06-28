import dotenv from 'dotenv';

dotenv.config();

console.log('PRIVATE_KEY:', process.env.PRIVATE_KEY ? 'Set' : 'Not set');
console.log('PACKAGE_ID:', process.env.PACKAGE_ID);
console.log('MODULE_NAME:', process.env.MODULE_NAME);
