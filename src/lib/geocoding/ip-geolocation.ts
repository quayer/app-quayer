export interface IpGeolocation {
  ip: string
  country?: string
  countryCode?: string
  city?: string
  region?: string
  timezone?: string
}

export async function getIpGeolocation(ip: string): Promise<IpGeolocation> {
  return { ip }
}
