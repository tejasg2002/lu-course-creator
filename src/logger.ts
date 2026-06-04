import fs from "node:fs";
import path from "node:path";

const LOG_DIR = path.join(process.cwd(), "logs");

export class SessionLogger {
  readonly filePath: string;
  private stream: fs.WriteStream;

  constructor(sessionId?: string) {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const id = sessionId ?? stamp;
    this.filePath = path.join(LOG_DIR, `course-${id}.log`);
    this.stream = fs.createWriteStream(this.filePath, { flags: "a" });
    this.write("INFO", "Log session started", { file: this.filePath });
  }

  info(message: string, data?: Record<string, unknown>) {
    this.write("INFO", message, data);
  }

  error(message: string, err?: unknown, data?: Record<string, unknown>) {
    const errData =
      err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : err !== undefined
          ? { detail: String(err) }
          : {};
    this.write("ERROR", message, { ...data, ...errData });
  }

  /** Console + file */
  progress(message: string) {
    console.log(message);
    this.write("INFO", message);
  }

  close() {
    this.stream.end();
  }

  private write(level: string, message: string, data?: Record<string, unknown>) {
    const line = {
      time: new Date().toISOString(),
      level,
      message,
      ...(data && Object.keys(data).length > 0 ? { data } : {}),
    };
    this.stream.write(JSON.stringify(line) + "\n");
  }
}
