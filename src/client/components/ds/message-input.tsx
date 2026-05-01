export interface MessageInputProps {
  value?: string
  onChange?: (value: string) => void
  onSend?: () => void
  disabled?: boolean
  placeholder?: string
  minLength?: number
  maxLength?: number
  [key: string]: unknown
}

export function MessageInput(_props: MessageInputProps) {
  return null
}
