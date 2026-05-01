import { createConsoleLogger, IgniterLogLevel } from '@igniter-js/core'

const levelMap: Record<string, IgniterLogLevel> = {
  debug: IgniterLogLevel.DEBUG,
  info: IgniterLogLevel.INFO,
  warn: IgniterLogLevel.WARN,
  error: IgniterLogLevel.ERROR,
}

export const logger = createConsoleLogger({ level: levelMap[process.env.LOG_LEVEL ?? 'info'] ?? IgniterLogLevel.INFO })
