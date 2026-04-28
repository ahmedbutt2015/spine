export interface BenchmarkRepo {
  name: string;
  description: string;
  gitUrl: string;
  language: string;
  size: "normal" | "big";
}

export const benchmarkCatalog: BenchmarkRepo[] = [
  {
    name: "axios",
    description: "Promise-based HTTP client with a compact but real JS/TS architecture.",
    gitUrl: "https://github.com/axios/axios.git",
    language: "javascript",
    size: "normal"
  },
  {
    name: "poetry",
    description: "Python packaging and dependency management tool with a meaningful CLI spine.",
    gitUrl: "https://github.com/python-poetry/poetry.git",
    language: "python",
    size: "big"
  },
  {
    name: "gin",
    description: "Popular Go web framework with approachable package structure.",
    gitUrl: "https://github.com/gin-gonic/gin.git",
    language: "go",
    size: "normal"
  },
  {
    name: "gitea",
    description: "Larger Go application benchmark with multiple subsystems.",
    gitUrl: "https://github.com/go-gitea/gitea.git",
    language: "go",
    size: "big"
  },
  {
    name: "serde",
    description: "Core Rust serialization framework with strong module boundaries.",
    gitUrl: "https://github.com/serde-rs/serde.git",
    language: "rust",
    size: "normal"
  },
  {
    name: "tokio",
    description: "Larger Rust async runtime benchmark.",
    gitUrl: "https://github.com/tokio-rs/tokio.git",
    language: "rust",
    size: "big"
  },
  {
    name: "express",
    description: "Classic JavaScript web framework benchmark.",
    gitUrl: "https://github.com/expressjs/express.git",
    language: "javascript",
    size: "normal"
  },
  {
    name: "nest",
    description: "Larger TypeScript framework benchmark.",
    gitUrl: "https://github.com/nestjs/nest.git",
    language: "typescript",
    size: "big"
  },
  {
    name: "slim",
    description: "Lightweight PHP benchmark for future parser coverage.",
    gitUrl: "https://github.com/slimphp/Slim.git",
    language: "php",
    size: "normal"
  },
  {
    name: "laravel-framework",
    description: "Larger PHP benchmark for future parser coverage.",
    gitUrl: "https://github.com/laravel/framework.git",
    language: "php",
    size: "big"
  }
];
