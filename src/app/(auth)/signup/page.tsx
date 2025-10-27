import Image from "next/image"
import Link from "next/link"
import { SignupForm } from "@/components/auth/signup-form"

export default function SignupPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <h1 className="sr-only">Criar uma nova conta no Quayer</h1>
        <Link href="/" className="flex items-center gap-2 self-center font-medium">
          <Image
            src="/logo.svg"
            alt="Quayer"
            width={120}
            height={28}
            priority
          />
        </Link>
        <SignupForm />
      </div>
    </div>
  )
}
