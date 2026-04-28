import { getUserService } from "../services/user-service.js";

export function handleUser(): string {
  return getUserService();
}

