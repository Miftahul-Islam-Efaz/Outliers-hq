import { redirect } from "next/navigation"
import AuthForm from "@/components/AuthForm"
import { currentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function LoginPage() {
  const user = await currentUser()
  if (user) redirect("/")
  return (
    <main className="auth-wrap">
      <AuthForm />
    </main>
  )
}
