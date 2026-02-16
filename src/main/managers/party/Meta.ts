/**
 * Clase base para manejar metadata en formato key-value de Epic Games
 */
export class Meta {
  public schema: Record<string, string>;

  /**
   * @param schema The key-value schema
   */
  constructor(schema?: Record<string, string>) {
    this.schema = schema || {};
  }

  /**
   * Adds a key-value pair to the schema
   * @param key The key
   * @param value The value
   * @param isRaw Whether the value should be added without further type checking
   * @returns A parsed version of the value
   */
  set(key: string, value: any, isRaw: boolean = false): string {
    if (isRaw) {
      this.schema[key] = value.toString();
      return this.schema[key];
    }

    const keyType = key.slice(-1);
    if (keyType === 'j') {
      this.schema[key] = JSON.stringify(value);
    } else if (keyType === 'U') {
      this.schema[key] = parseInt(value, 10).toString();
    } else {
      this.schema[key] = value.toString();
    }

    return this.schema[key];
  }

  /**
   * Gets a value inside the schema by its key
   * @param key The key
   * @returns The value of the provided key
   */
  get(key: string): any {
    const keyType = key.slice(-1);

    if (keyType === 'b') {
      return this.schema[key] === 'true';
    }

    if (keyType === 'j') {
      return typeof this.schema[key] !== 'undefined'
        ? JSON.parse(this.schema[key])
        : {};
    }

    if (keyType === 'U') {
      return typeof this.schema[key] !== 'undefined'
        ? parseInt(this.schema[key], 10)
        : undefined;
    }

    return typeof this.schema[key] !== 'undefined'
      ? this.schema[key].toString()
      : '';
  }

  /**
   * Updates the schema
   * @param schema The new schema
   * @param isRaw Whether the values are raw
   */
  update(schema: Record<string, any>, isRaw: boolean = false): void {
    Object.keys(schema).forEach(prop => this.set(prop, schema[prop], isRaw));
  }

  /**
   * Deletes the provided keys
   * @param keys The keys to delete
   */
  remove(keys: string[]): void {
    keys.forEach(k => delete this.schema[k]);
  }
}
