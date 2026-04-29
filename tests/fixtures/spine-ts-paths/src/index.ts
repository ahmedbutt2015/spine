import { createUserService } from "@/services/user-service";
import { logger } from "@utils";

export function bootstrap(): void {
  const service = createUserService();
  logger.info(`Bootstrapped ${service.name}`);
}
