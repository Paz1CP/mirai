import { SignIn } from "@/features/auth/SignIn";
import { getLocale } from "@/shared/i18n/server";
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return <SignIn locale={await getLocale()} callbackError={Boolean((await searchParams).error)} />;
}
