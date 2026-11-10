import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, completeProfile, requestOtp, verifyOtp } from "../../api";
import { useAuth } from "../../auth";
import { useScreenInit } from "../../useScreenInit";
import { Button, TextInput } from "../../ui";
import { OnboardingFrame, PositionIllustration } from "./OnboardingFrame";

type LoginStep = "phone" | "otp" | "name";

export default function Login() {
  const initial = useScreenInit();
  const seedStep = initial.step;
  const [step, setStep] = useState<LoginStep>(seedStep === "otp" || seedStep === "name" ? seedStep : "phone");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState(false);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState(Boolean(initial.otpError));
  const [expired, setExpired] = useState(Boolean(initial.expired));
  const [remaining, setRemaining] = useState(24);
  const [name, setName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const navigate = useNavigate();
  const { setAuthenticatedUser } = useAuth();

  useEffect(() => {
    if (step !== "otp" || expired || remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [step, expired, remaining > 0]);

  const sendOtp = async () => {
    if (!/^[6-9]\d{9}$/.test(phone)) { setPhoneError(true); return; }
    setPhoneError(false);
    setErrorMessage("");
    setBusy(true);
    try {
      const result = await requestOtp(phone);
      setStep("otp");
      setExpired(false);
      setOtpError(false);
      setDigits(["", "", "", "", "", ""]);
      setRemaining(result.resend_after_seconds);
      window.setTimeout(() => refs.current[0]?.focus(), 0);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : "Unable to send OTP. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    const code = digits.join("");
    if (expired) return;
    if (code.length !== 6) { setOtpError(true); setErrorMessage("Enter the six-digit OTP"); return; }
    setOtpError(false);
    setErrorMessage("");
    setBusy(true);
    try {
      const result = await verifyOtp(phone, code);
      if (result.status === "authenticated") {
        setAuthenticatedUser(result.user);
        navigate("/positions", { replace: true });
      } else {
        setStep("name");
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "otp_expired") {
          setExpired(true);
          setErrorMessage("OTP expired");
        } else if (error.code === "otp_attempts_exceeded") {
          setExpired(true);
          setOtpError(true);
          setErrorMessage("Maximum verification attempts reached. Request a new OTP.");
        } else if (error.code === "invalid_otp") {
          const attempts = Number(error.detail.attempts_remaining ?? 0);
          setOtpError(true);
          setErrorMessage(`Incorrect OTP. ${attempts} attempt${attempts === 1 ? "" : "s"} left`);
        } else {
          setOtpError(true);
          setErrorMessage(error.message);
        }
      } else {
        setOtpError(true);
        setErrorMessage("Unable to verify OTP. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };
  const resend = async () => {
    setExpired(false); setOtpError(false); setErrorMessage("");
    await sendOtp();
  };
  const continueToBrokers = async () => {
    const displayName = name.trim();
    if (!displayName) { setErrorMessage("Enter your name to continue"); return; }
    setBusy(true);
    setErrorMessage("");
    try {
      const user = await completeProfile(displayName);
      setAuthenticatedUser(user);
      navigate("/onboarding/brokers", { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : "Unable to create your account. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const goBack = () => {
    setErrorMessage("");
    setOtpError(false);
    setExpired(false);
    setStep("phone");
  };

  return <OnboardingFrame visual={<PositionIllustration />}>
    <div className="mx-auto w-full max-w-md">
      {step !== "phone" && <button onClick={goBack} className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink"><ArrowLeft size={16} strokeWidth={2} /> Back</button>}
      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary"><ShieldCheck size={22} strokeWidth={2} /></div>
      {step === "phone" && <>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Welcome to Timed Exit</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Enter your mobile number to get started. We'll send you a one-time password.</p>
        <div className="mt-8"><label className="mb-2 block text-sm font-medium text-ink-2">Mobile number</label><TextInput value={phone} onChange={(v) => { setPhone(v.replace(/\D/g, "").slice(0, 10)); setPhoneError(false); }} prefix="+91" placeholder="10-digit mobile number" inputMode="numeric" maxLength={10} invalid={phoneError} />{phoneError && <p className="mt-2 text-sm text-loss">Enter a valid 10-digit mobile number</p>}</div>
        {errorMessage && <p className="mt-3 text-sm text-loss">{errorMessage}</p>}
        <Button className="mt-5" size="lg" full iconRight={ArrowRight} onClick={sendOtp} disabled={busy}>{busy ? "Sending…" : "Send OTP"}</Button>
      </>}
      {step === "otp" && <>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Verify your number</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Sent to +91 {phone.slice(0, 5)} {phone.slice(5)} <button onClick={() => setStep("phone")} className="ml-1 font-medium text-primary hover:underline">Edit</button></p>
        <div className="mt-8 grid grid-cols-6 gap-2" role="group" aria-label="6-digit OTP">{digits.map((d, i) => <input key={i} ref={(el) => { refs.current[i] = el; }} value={d} onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(-1); setDigits((old) => old.map((n, j) => j === i ? v : n)); setOtpError(false); if (v && i < 5) refs.current[i + 1]?.focus(); }} onKeyDown={(e) => { if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus(); if (e.key === "Enter") verify(); }} inputMode="numeric" maxLength={1} aria-label={`OTP digit ${i + 1}`} className={`h-12 min-w-0 rounded-md border bg-surface text-center font-mono text-lg font-semibold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-line ${otpError || expired ? "border-loss" : "border-line-strong"}`} />)}</div>
        {(otpError || expired || errorMessage) && <p className="mt-3 text-sm text-loss">{errorMessage || (expired ? "OTP expired" : "Incorrect OTP")}</p>}
        <Button className="mt-5" size="lg" full iconRight={ArrowRight} onClick={verify} disabled={expired || busy}>{busy ? "Verifying…" : "Verify"}</Button>
        <div className="mt-4 text-center text-sm text-muted">{remaining > 0 ? <span>Resend OTP in <span className="font-mono tabular-nums">0:{String(remaining).padStart(2, "0")}</span></span> : <button onClick={resend} disabled={busy} className="font-medium text-primary hover:underline disabled:text-faint">Resend OTP</button>}</div>
      </>}
      {step === "name" && <>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">What should we call you?</h1>
        <p className="mt-3 text-sm leading-6 text-muted">You're in. Add your name to make your account feel like yours.</p>
        <div className="mt-8"><label className="mb-2 block text-sm font-medium text-ink-2">Your name</label><TextInput value={name} onChange={(value) => { setName(value); setErrorMessage(""); }} placeholder="e.g. Arjun Mehta" autoFocus /></div>
        {errorMessage && <p className="mt-3 text-sm text-loss">{errorMessage}</p>}
        <Button className="mt-5" size="lg" full iconRight={ArrowRight} onClick={continueToBrokers} disabled={busy}>{busy ? "Creating account…" : "Continue"}</Button>
      </>}
      <p className="mt-8 text-center text-xs leading-5 text-muted">By continuing, you agree to our <Link to="/terms" className="font-medium text-ink-2 underline underline-offset-2">Terms of Service</Link> and <Link to="/privacy" className="font-medium text-ink-2 underline underline-offset-2">Privacy Policy</Link>.</p>
    </div>
  </OnboardingFrame>;
}
