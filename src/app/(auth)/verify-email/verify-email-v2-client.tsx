'use client'

import { useSearchParams } from 'next/navigation'
import Image from "next/image"
import Link from "next/link"
import { VerifyEmailForm } from "@/client/components/auth/verify-email-form"

export function VerifyEmailV2Client() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email')

  return (
    <div className="flex min-h-svh flex-col items-center gap-6 px-6 pb-6 pt-[15vh] md:px-10 md:pb-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/login" className="flex items-center gap-2 self-start font-medium">
          <Image
            src="/logo.svg"
            alt="Quayer"
            width={120}
            height={28}
            priority
          />
        </Link>
        <VerifyEmailForm email={email || undefined} />
      </div>
    </div>
  )
}
