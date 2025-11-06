import postgres from 'postgres';

/**
 * Database client for Souvenir using the postgres package
 * Provides a thin wrapper with multi-runtime considerations
 */
export class DatabaseClient {
  private sql: ReturnType<typeof postgres>;

  constructor(connectionString: string) {
    this.sql = postgres(connectionString, {
      max: 20,
      idle_timeout: 30,
      connect_timeout: 2,
      onnotice: () => {}, // Silence notices
    });
  }

  /**
   * Execute a query - direct access to postgres client
   */
  get query() {
    return this.sql;
  }

  /**
   * Execute queries in a transaction
   */
  async transaction<T>(callback: (sql: ReturnType<typeof postgres>) => Promise<T>): Promise<T> {
    return this.sql.begin(async (sql) => {
      return callback(sql);
    });
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.sql.end();
  }

  /**
   * Check if database is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.sql`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
