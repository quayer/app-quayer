export type ModalInstance = {
  id: string
  name: string
  phoneNumber: string | null
  status: string
  brokerType: string
  createdAt: string
  organization: { id: string; name: string } | null
}
