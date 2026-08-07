import { config } from 'dotenv';

// Chargé avant tout module de test : les variables ainsi posées priment sur le
// .env de développement, que ConfigModule lira ensuite sans les écraser.
config({ path: '.env.test', override: true });
