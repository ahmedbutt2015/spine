import { logger } from "@utils";

export function createUserService(): { name: string } {
  logger.info("Creating user service");
  return { name: "user-service" };
}
