import Image from "next/image"
import Link from "next/link"
import { SignupForm } from "@/client/components/auth/signup-form"

export default function SignupPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-start font-medium">
          <Image
            src="/logo.svg"
            alt="Quayer"
            width={120}
            height={28}
            style={{ height: "auto" }}
            priority
          />
        </Link>
        <SignupForm />
      </div>
    </div>
  )
}
