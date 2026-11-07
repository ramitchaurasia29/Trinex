import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../../store";
import { useScreenInit } from "../../useScreenInit";
import { Button, TextInput } from "../../ui";
import { OnboardingFrame, PositionIllustration } from "./OnboardingFrame";

type LoginStep = "phone" | "otp" | "name";

export default function Login() {
  const initial = useScreenInit();
  const seedStep = initial.step;
  const [step, setStep] = useState<LoginStep>(seedStep === "otp" || seedStep === "name" ? seedStep : "phone");
  const [phone, setPhone] = useState("9820144718");
  const [phoneError, setPhoneError] = useState(false);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState(Boolean(initial.otpError));
  const [expired, setExpired] = useState(Boolean(initial.expired));
  const [remaining, setRemaining] = useState(24);
  const [name, setName] = useState("");
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const navigate = useNavigate();
  const { setUser } = useStore();

  useEffect(() => {
    if (step !== "otp" || expired || remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [step, expired, remaining > 0]);

  const sendOtp = () => {
    if (!/^\d{10}$/.test(phone)) { setPhoneError(true); return; }
    setPhoneError(false);
    setStep("otp");
    setExpired(false);
    setOtpError(false);
    setRemaining(24);
  };
  const verify = () => {
    const code = digits.join("");
    if (expired) return;
    if (code.length !== 6 || code === "000000") { setOtpError(true); return; }
    setOtpError(false);
    setStep("name");
  };
  const resend = () => { setExpired(false); setOtpError(false); setDigits(["", "", "", "", "", ""]); setRemaining(24); refs.current[0]?.focus(); };
  const continueToBrokers = () => { setUser({ name: name.trim() || "Trader", phone: `+91 ${phone}` }); navigate("/onboarding/brokers"); };

  return <OnboardingFrame visual={<PositionIllustration />}>
    <div className="mx-auto w-full max-w-md">
      {step !== "phone" && <button onClick={() => setStep(step === "name" ? "otp" : "phone")} className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink"><ArrowLeft size={16} strokeWidth={2} /> Back</button>}
      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary"><ShieldCheck size={22} strokeWidth={2} /></div>
      {step === "phone" && <>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Welcome to Timed Exit</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Enter your mobile number to get started. We'll send you a one-time password.</p>
        <div className="mt-8"><label className="mb-2 block text-sm font-medium text-ink-2">Mobile number</label><TextInput value={phone} onChange={(v) => { setPhone(v.replace(/\D/g, "").slice(0, 10)); setPhoneError(false); }} prefix="+91" placeholder="10-digit mobile number" inputMode="numeric" maxLength={10} invalid={phoneError} />{phoneError && <p className="mt-2 text-sm text-loss">Enter a valid 10-digit mobile number</p>}</div>
        <Button className="mt-5" size="lg" full iconRight={ArrowRight} onClick={sendOtp}>Send OTP</Button>
      </>}
      {step === "otp" && <>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Verify your number</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Sent to +91 {phone.slice(0, 5)} {phone.slice(5)} <button onClick={() => setStep("phone")} className="ml-1 font-medium text-primary hover:underline">Edit</button></p>
        <div className="mt-8 grid grid-cols-6 gap-2" role="group" aria-label="6-digit OTP">{digits.map((d, i) => <input key={i} ref={(el) => { refs.current[i] = el; }} value={d} onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(-1); setDigits((old) => old.map((n, j) => j === i ? v : n)); setOtpError(false); if (v && i < 5) refs.current[i + 1]?.focus(); }} onKeyDown={(e) => { if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus(); if (e.key === "Enter") verify(); }} inputMode="numeric" maxLength={1} aria-label={`OTP digit ${i + 1}`} className={`h-12 min-w-0 rounded-md border bg-surface text-center font-mono text-lg font-semibold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-line ${otpError || expired ? "border-loss" : "border-line-strong"}`} />)}</div>
        {(otpError || expired) && <p className="mt-3 text-sm text-loss">{expired ? "OTP expired" : "Incorrect OTP. 2 attempts left"}</p>}
        <Button className="mt-5" size="lg" full iconRight={ArrowRight} onClick={verify} disabled={expired}>Verify</Button>
        <div className="mt-4 text-center text-sm text-muted">{remaining > 0 ? <span>Resend OTP in <span className="font-mono tabular-nums">0:{String(remaining).padStart(2, "0")}</span></span> : <button onClick={resend} className="font-medium text-primary hover:underline">Resend OTP</button>}</div>
      </>}
      {step === "name" && <>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">What should we call you?</h1>
        <p className="mt-3 text-sm leading-6 text-muted">You're in. Add your name to make your account feel like yours.</p>
        <div className="mt-8"><label className="mb-2 block text-sm font-medium text-ink-2">Your name</label><TextInput value={name} onChange={setName} placeholder="e.g. Arjun Mehta" autoFocus /></div>
        <Button className="mt-5" size="lg" full iconRight={ArrowRight} onClick={continueToBrokers}>Continue</Button>
      </>}
      <p className="mt-8 text-center text-xs leading-5 text-muted">By continuing, you agree to our <Link to="/terms" className="font-medium text-ink-2 underline underline-offset-2">Terms of Service</Link> and <Link to="/privacy" className="font-medium text-ink-2 underline underline-offset-2">Privacy Policy</Link>.</p>
    </div>
  </OnboardingFrame>;
}
