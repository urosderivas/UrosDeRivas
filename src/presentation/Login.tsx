import { useEffect, useState } from 'react';
import { useStore } from './store';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { rememberLoginNext, safeNextPath } from '../utils/loginRedirect';
import './Login.css';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

export function Login() {
  const { signIn, signUp, signInWithGoogle, sendPasswordReset, updatePassword } = useStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Página a la que volver tras iniciar sesión (p. ej. el campus en el que se quería inscribir)
  const next = safeNextPath(searchParams.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(searchParams.get('link') === 'expired'
    ? 'El enlace del correo ha caducado o ya se ha usado. Si querías cambiar la contraseña, pide uno nuevo con «¿Olvidaste tu contraseña?».'
    : '');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'reset' ? 'reset' : 'login');
  const isRegister = mode === 'register';

  // El enlace del correo de recuperación puede llegar con la página de login ya abierta
  useEffect(() => {
    if (searchParams.get('mode') === 'reset') setMode('reset');
  }, [searchParams]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setSuccess('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (mode === 'forgot') {
      try {
        await sendPasswordReset(email);
        // Mismo mensaje exista o no la cuenta, para no revelar qué emails están registrados
        setSuccess('Si hay una cuenta con ese email, te hemos enviado un enlace para elegir una contraseña nueva. Revisa también la carpeta de spam.');
      } catch (err: any) {
        setError(err.message || 'No se pudo enviar el correo.');
      }
    } else if (mode === 'reset') {
      if (password.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres.');
      } else if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden.');
      } else {
        try {
          await updatePassword(password);
          setSuccess('✅ Contraseña cambiada. Ya has iniciado sesión.');
          setTimeout(() => navigate('/', { replace: true }), 1500);
        } catch (err: any) {
          setError(err.message?.includes('session')
            ? 'El enlace ha caducado. Pide uno nuevo desde «¿Olvidaste tu contraseña?».'
            : err.message || 'No se pudo cambiar la contraseña.');
        }
      }
    } else if (isRegister) {
      // Register flow
      if (password.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres.');
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden.');
        setLoading(false);
        return;
      }
      try {
        await signUp(email, password);
        switchMode('login');
        setSuccess('✅ Cuenta creada. Revisa tu email para confirmar tu cuenta antes de iniciar sesión.');
      } catch (err: any) {
        setError(err.message || 'Error al crear la cuenta.');
      }
    } else {
      // Login flow
      try {
        await signIn(email, password);
        navigate(next || '/');
      } catch (err: any) {
        if (err.message?.includes('Invalid login credentials')) {
          setError('Email o contraseña incorrectos.');
        } else if (err.message?.includes('Email not confirmed')) {
          setError('Confirma tu email antes de iniciar sesión. Revisa tu bandeja de entrada.');
        } else {
          setError(err.message || 'Error al iniciar sesión.');
        }
      }
    }
    setLoading(false);
  };

  const handleGoogleAuth = async () => {
    setError('');
    setLoading(true);
    try {
      rememberLoginNext(next);
      await signInWithGoogle();
      // Google Auth redirects away, so no local navigation is needed here immediately.
    } catch (err: any) {
      setError(err.message || 'Error initiating Google Auth');
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>{{ login: 'Acceso al Club', register: 'Crear Cuenta', forgot: 'Recuperar contraseña', reset: 'Nueva contraseña' }[mode]}</h2>
        <p>
          {{
            login: 'Inicia sesión para acceder a todas las funcionalidades del club.',
            register: 'Regístrate con tu email para inscribirte en campus, comprar en la tienda y más.',
            forgot: 'Escribe el email de tu cuenta y te enviaremos un enlace para elegir una contraseña nueva.',
            reset: 'Elige la contraseña nueva para tu cuenta.',
          }[mode]}
        </p>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          {mode !== 'reset' && (
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
            />
          </div>
          )}
          {mode !== 'forgot' && (
          <div className="form-group">
            <label>{mode === 'reset' ? 'Contraseña nueva' : 'Contraseña'}</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
            />
          </div>
          )}

          {mode === 'login' && (
            <button type="button" className="link-btn forgot-link" onClick={() => switchMode('forgot')}>
              ¿Olvidaste tu contraseña?
            </button>
          )}

          {(isRegister || mode === 'reset') && (
            <div className="form-group">
              <label>Confirmar Contraseña</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
              />
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading
              ? 'Procesando...'
              : { login: 'Iniciar Sesión', register: 'Crear Cuenta', forgot: 'Enviar enlace', reset: 'Guardar contraseña' }[mode]}
          </button>

          {(mode === 'login' || isRegister) && (<>
          <div className="auth-separator">o continuar con</div>

          <button type="button" className="btn-secondary google-btn" onClick={handleGoogleAuth} disabled={loading}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google
          </button>
          </>)}

          <div className="auth-toggle">
            {mode === 'login' ? (
              <p>¿No tienes cuenta? <button type="button" className="link-btn" onClick={() => switchMode('register')}>Regístrate</button></p>
            ) : mode !== 'reset' && (
              <p>{isRegister ? '¿Ya tienes cuenta?' : '¿Te has acordado?'} <button type="button" className="link-btn" onClick={() => switchMode('login')}>Inicia sesión</button></p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
