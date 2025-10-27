"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";

export function OTPForm({ className, ...props }: React.ComponentProps<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Aqui voc� implementar� a l�gica de verifica��o do OTP
      console.log("Verificando OTP:", otp, "para o email:", email);
      // Por enquanto, redireciona para o login ap�s verifica��o
      router.push("/login");
    } catch (error) {
      console.error("Erro ao verificar OTP:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      // Aqui voc� implementar� a l�gica de reenvio do c�digo
      console.log("Reenviando c�digo para:", email);
    } catch (error) {
      console.error("Erro ao reenviar c�digo:", error);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <Link
              href="/"
              className="flex flex-col items-center gap-2 font-medium"
            >
              <div className="flex size-16 items-center justify-center">
                <Image
                  src="/logo.svg"
                  alt="Quayer"
                  width={64}
                  height={64}
                  className="dark:invert"
                />
              </div>
              <span className="sr-only">Quayer</span>
            </Link>
            <h1 className="text-xl font-bold">Digite o c�digo de verifica��o</h1>
            <FieldDescription>
              Enviamos um c�digo de 6 d�gitos para {email || "seu e-mail"}
            </FieldDescription>
          </div>

          <Field className="flex flex-col items-center space-y-2">
            <FieldLabel htmlFor="otp" className="sr-only">
              C�digo de verifica��o
            </FieldLabel>
            <div className="flex justify-center w-full">
              <InputOTP
                maxLength={6}
                id="otp"
                value={otp}
                onChange={setOtp}
                required
                containerClassName="gap-4"
              >
                <InputOTPGroup className="gap-2.5 *:data-[slot=input-otp-slot]:h-16 *:data-[slot=input-otp-slot]:w-12 *:data-[slot=input-otp-slot]:rounded-md *:data-[slot=input-otp-slot]:border *:data-[slot=input-otp-slot]:text-xl">
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup className="gap-2.5 *:data-[slot=input-otp-slot]:h-16 *:data-[slot=input-otp-slot]:w-12 *:data-[slot=input-otp-slot]:rounded-md *:data-[slot=input-otp-slot]:border *:data-[slot=input-otp-slot]:text-xl">
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <FieldDescription className="text-center mt-2">
              N�o recebeu o c�digo?{" "}
              <button
                type="button"
                onClick={handleResend}
                className="underline underline-offset-4"
              >
                Reenviar
              </button>
            </FieldDescription>
          </Field>

          <Field>
            <Button type="submit" disabled={isLoading || otp.length !== 6}>
              {isLoading ? "Verificando..." : "Verificar"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
      <FieldDescription className="px-6 text-center">
        Ao continuar, voc� concorda com nossos{" "}
        <Link href="/termos" className="underline underline-offset-4">
          Termos de Servi�o
        </Link>{" "}
        e{" "}
        <Link href="/privacidade" className="underline underline-offset-4">
          Pol�tica de Privacidade
        </Link>
        .
      </FieldDescription>
    </div>
  );
}
