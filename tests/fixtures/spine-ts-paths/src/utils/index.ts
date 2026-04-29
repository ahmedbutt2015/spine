export const logger = {
  info(message: string): void {
    process.stdout.write(`${message}\n`);
  }
};
