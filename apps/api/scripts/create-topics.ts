import * as path from 'path';
import * as dotenv from 'dotenv';
import { Kafka, logLevel } from 'kafkajs';
import { KAFKA_TOPICS } from '@ecommerce/shared';
import { buildKafkaSaslConfig, buildKafkaSslConfig } from '../src/kafka/kafka.service';

const dotenvPath = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: dotenvPath });

// Simple config wrapper matching ConfigService.get
const configReader = {
  get: <T = string>(key: string, defaultValue?: T): T | undefined => {
    const val = process.env[key];
    if (val === undefined || val === '') {
      return defaultValue;
    }
    return val as unknown as T;
  },
};

async function main() {
  const brokersRaw = configReader.get<string>('KAFKA_BROKERS', 'localhost:9092') || 'localhost:9092';
  const brokers = brokersRaw
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);
  const clientId = configReader.get<string>('KAFKA_CLIENT_ID', 'ecommerce-setup-admin') || 'ecommerce-setup-admin';
  const partitions = Number(configReader.get<string>('KAFKA_PARTITIONS', '3')) || 3;
  const replicationFactor = Number(configReader.get<string>('KAFKA_REPLICATION_FACTOR', '1')) || 1;

  const sslConfig = buildKafkaSslConfig(configReader);
  const saslConfig = buildKafkaSaslConfig(configReader);

  console.log(`Connecting to Kafka at: ${brokers.join(', ')}`);
  console.log(`SSL enabled: ${Boolean(sslConfig)}, SASL mechanism: ${saslConfig?.mechanism ?? 'none'}`);

  const kafka = new Kafka({
    clientId,
    brokers,
    ssl: sslConfig,
    ...(saslConfig ? { sasl: saslConfig } : {}),
    logLevel: logLevel.INFO,
    connectionTimeout: 5000,
    retry: {
      initialRetryTime: 300,
      retries: 2,
    },
  });

  const admin = kafka.admin();
  try {
    await admin.connect();
    console.log('Connected to Kafka admin client successfully.');

    const existingTopics = await admin.listTopics();
    console.log(`Existing topics in cluster: ${existingTopics.join(', ') || '(none)'}`);

    const targetTopics = Object.values(KAFKA_TOPICS);
    const toCreate = targetTopics.filter((t) => !existingTopics.includes(t));

    if (toCreate.length === 0) {
      console.log('All required Kafka topics already exist. No action needed.');
    } else {
      console.log(`Creating ${toCreate.length} missing topic(s): ${toCreate.join(', ')}`);
      await admin.createTopics({
        waitForLeaders: true,
        topics: toCreate.map((topic) => ({
          topic,
          numPartitions: partitions,
          replicationFactor,
          configEntries: [
            // 24-hour retention to respect free-tier storage limits
            { name: 'retention.ms', value: '86400000' },
            { name: 'cleanup.policy', value: 'delete' },
          ],
        })),
      });
      console.log(`Successfully created topic(s): ${toCreate.join(', ')}`);
    }

    const verifiedTopics = await admin.listTopics();
    console.log(`Verified cluster topics: ${verifiedTopics.join(', ')}`);
  } catch (error) {
    console.error('\n[Error] Failed to connect to Kafka brokers or create topics:');
    console.error(`- Target brokers: ${brokers.join(', ')}`);
    console.error(`- Reason: ${error instanceof Error ? error.message : String(error)}`);
    console.error('\nPlease verify your Aiven Kafka credentials in .env, or if testing locally, ensure Docker Kafka is running (npm run infra:up).\n');
    process.exit(1);
  } finally {
    await admin.disconnect().catch(() => undefined);
  }
}

void main();
