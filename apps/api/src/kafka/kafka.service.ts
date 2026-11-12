import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KAFKA_TOPICS } from '@ecommerce/shared';
import { Consumer, Kafka, logLevel, Partitioners, Producer, SASLOptions } from 'kafkajs';
import * as net from 'net';

export type KafkaMessageHandler = (
  payload: Record<string, unknown>,
  rawKey: string | null,
) => Promise<void>;

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private readonly kafka: Kafka;
  private readonly producer: Producer;
  private readonly consumers: Consumer[] = [];
  private readonly brokers: string[];
  private producerConnected = false;
  private topicsEnsured = false;
  private topicsPromise: Promise<void> | null = null;
  private lastWarnAt = 0;
  private readonly groupPrefix: string;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    const brokersRaw = this.config.get<string>('KAFKA_BROKERS', 'localhost:9092');
    this.brokers = brokersRaw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const clientId = this.config.get<string>('KAFKA_CLIENT_ID', 'ecommerce-api');
    this.groupPrefix = this.config.get<string>('KAFKA_GROUP_PREFIX', 'ecommerce');
    const sslEnabled = this.config.get<string>('KAFKA_SSL', 'false') === 'true';
    const saslMechanism = this.config.get<string>('KAFKA_SASL_MECHANISM', '').trim().toLowerCase();
    const saslUsername = this.config.get<string>('KAFKA_USERNAME', '').trim();
    const saslPassword = this.config.get<string>('KAFKA_PASSWORD', '').trim();

    let saslConfig: SASLOptions | undefined;
    if (saslUsername && saslPassword) {
      if (saslMechanism === 'scram-sha-512') {
        saslConfig = { mechanism: 'scram-sha-512', username: saslUsername, password: saslPassword };
      } else if (saslMechanism === 'plain') {
        saslConfig = { mechanism: 'plain', username: saslUsername, password: saslPassword };
      } else {
        saslConfig = { mechanism: 'scram-sha-256', username: saslUsername, password: saslPassword };
      }
    }

    this.kafka = new Kafka({
      clientId,
      brokers: this.brokers,
      ssl: sslEnabled || Boolean(saslConfig),
      ...(saslConfig ? { sasl: saslConfig } : {}),
      logLevel: logLevel.WARN,
      connectionTimeout: 3000,
      retry: {
        initialRetryTime: 300,
        retries: 2,
      },
    });
    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      createPartitioner: Partitioners.DefaultPartitioner,
    });
  }

  onModuleInit(): void {
    if (process.env.SKIP_INFRA_BOOT === 'true') {
      return;
    }
    void this.ensureConnected();
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      ...this.consumers.map((consumer) => consumer.disconnect()),
      this.producerConnected ? this.producer.disconnect() : Promise.resolve(),
    ]);
    this.producerConnected = false;
  }

  private async isAnyBrokerReachable(): Promise<boolean> {
    for (const broker of this.brokers) {
      const [host, portStr] = broker.split(':');
      const port = Number(portStr || '9092');
      const ok = await new Promise<boolean>((resolve) => {
        const socket = net.createConnection({ host: host || 'localhost', port });
        const timer = setTimeout(() => {
          socket.destroy();
          resolve(false);
        }, 600);
        socket.once('connect', () => {
          clearTimeout(timer);
          socket.destroy();
          resolve(true);
        });
        socket.once('error', () => {
          clearTimeout(timer);
          socket.destroy();
          resolve(false);
        });
      });
      if (ok) {
        return true;
      }
    }
    return false;
  }

  private logOfflineOnce(message: string): void {
    const now = Date.now();
    if (now - this.lastWarnAt > 30000) {
      this.lastWarnAt = now;
      this.logger.warn(message);
    }
  }

  async ensureConnected(): Promise<boolean> {
    if (this.producerConnected) {
      return true;
    }
    const reachable = await this.isAnyBrokerReachable();
    if (!reachable) {
      this.logOfflineOnce(
        `Kafka broker (${this.brokers.join(', ')}) is offline; Kafka producer & consumers waiting.`,
      );
      return false;
    }
    try {
      await this.producer.connect();
      this.producerConnected = true;
      await this.ensureTopics();
      this.logger.log('Connected to Kafka producer');
      return true;
    } catch (error) {
      this.producerConnected = false;
      this.logOfflineOnce(
        `Kafka broker not ready yet: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  private async ensureTopics(): Promise<void> {
    if (this.topicsEnsured) {
      return;
    }
    if (this.topicsPromise) {
      return this.topicsPromise;
    }
    this.topicsPromise = (async () => {
      const admin = this.kafka.admin();
      try {
        await admin.connect();
        const existing = await admin.listTopics();
        const desired = Object.values(KAFKA_TOPICS).filter((topic) => !existing.includes(topic));
        if (desired.length > 0) {
          await admin.createTopics({
            waitForLeaders: true,
            topics: desired.map((topic) => ({
              topic,
              numPartitions: 3,
              replicationFactor: 1,
            })),
          });
          this.logger.log(`Created Kafka topics: ${desired.join(', ')}`);
        }
        this.topicsEnsured = true;
      } catch (error) {
        this.logOfflineOnce(
          `Unable to verify/create Kafka topics: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        await admin.disconnect().catch(() => undefined);
        this.topicsPromise = null;
      }
    })();
    return this.topicsPromise;
  }

  async publish(topic: string, key: string, payload: unknown): Promise<void> {
    const connected = await this.ensureConnected();
    if (!connected) {
      throw new Error('Kafka producer is not connected');
    }
    await this.producer.send({
      topic,
      messages: [
        {
          key,
          value: JSON.stringify(payload),
        },
      ],
    });
  }

  async registerConsumer(
    groupSuffix: string,
    topic: string,
    handler: KafkaMessageHandler,
  ): Promise<void> {
    if (process.env.SKIP_INFRA_BOOT === 'true') {
      return;
    }
    const consumer = this.kafka.consumer({
      groupId: `${this.groupPrefix}-${groupSuffix}`,
    });
    this.consumers.push(consumer);

    consumer.on('consumer.crash', (event) => {
      this.logger.warn(
        `Kafka consumer "${groupSuffix}" crashed (${event.payload?.error?.message ?? 'unknown'}); scheduling restart`,
      );
      setTimeout(() => {
        void startConsumer();
      }, 15000).unref();
    });

    const startConsumer = async (): Promise<void> => {
      try {
        const reachable = await this.isAnyBrokerReachable();
        if (!reachable) {
          this.logOfflineOnce(
            `Kafka broker (${this.brokers.join(', ')}) is offline; consumer "${groupSuffix}" will retry.`,
          );
          setTimeout(() => {
            void startConsumer();
          }, 15000).unref();
          return;
        }
        await this.ensureTopics();
        await consumer.connect();
        await consumer.subscribe({ topic, fromBeginning: false });
        await consumer.run({
          eachMessage: async ({ message }) => {
            if (!message.value) {
              return;
            }
            try {
              const parsed = JSON.parse(message.value.toString('utf-8')) as Record<string, unknown>;
              const rawKey = message.key ? message.key.toString('utf-8') : null;
              await handler(parsed, rawKey);
            } catch (error) {
              this.logger.error(
                `Failed handling message on ${topic}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          },
        });
        this.logger.log(`Kafka consumer "${groupSuffix}" subscribed to ${topic}`);
      } catch (error) {
        this.logOfflineOnce(
          `Kafka consumer "${groupSuffix}" failed to start (${error instanceof Error ? error.message : String(error)}); retrying in 15s`,
        );
        setTimeout(() => {
          void startConsumer();
        }, 15000).unref();
      }
    };

    void startConsumer();
  }

  async isHealthy(): Promise<boolean> {
    if (!(await this.isAnyBrokerReachable())) {
      return false;
    }
    const admin = this.kafka.admin();
    try {
      await admin.connect();
      await admin.listTopics();
      return true;
    } catch {
      return false;
    } finally {
      await admin.disconnect().catch(() => undefined);
    }
  }
}
