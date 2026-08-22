const oracledb = require('oracledb');
try {
  console.log('Attempting to init Oracle Client in Thick mode...');
  oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
  console.log('Success! Thick mode initialized.');
} catch(e) {
  console.error('Failed to init Thick mode:', e.message);
}
