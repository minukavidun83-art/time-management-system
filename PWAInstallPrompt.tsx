import React, { useEffect, useState } from 'react';
import { Download, ExternalLink, GraduationCap, Smartphone, WifiOff, X } from 'lucide-react';
import { t } from '../lib/i18n.ts';
import { useOnlineStatus, usePWAInstall } from '../lib/usePWAInstall.ts';
import type { UiLanguage } from '../types/shared.ts';

interface PWAInstallProps {
  lang: UiLanguage;
  appName?: string;
  customMessage?: string;
}

export const PWAInstallButton: React.FC<PWAInstallProps> = ({
  lang,
  appName = 'Student Time Management System',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showPromptDialog, setShowPromptDialog] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    if (isInstallable) {
      // Triggers the browser's native [Install] / [Not now] prompt immediately
      const accepted = await install();
      if (accepted) return;
    } else {
      setShowPromptDialog(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{t(lang, 'pwa_install_btn')}</span>
      </button>

      {showPromptDialog && (
        <InstallConfirmModal
          lang={lang}
          appName={appName}
          isIOS={isIOS}
          isInstallable={isInstallable}
          onNativeInstall={async () => {
            const ok = await install();
            if (ok) setShowPromptDialog(false);
          }}
          onClose={() => setShowPromptDialog(false)}
        />
      )}
    </>
  );
};

export const PWAInstallBanner: React.FC<PWAInstallProps> = ({
  lang,
  appName = 'Student Time Management System',
  customMessage,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);
  const [showPromptDialog, setShowPromptDialog] = useState(false);

  // If user opened directly in a top-level tab with ?install=1 and prompt becomes ready, auto-trigger native dialog
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('install') === '1' && isInstallable) {
      install().catch(() => {});
    }
  }, [isInstallable, install]);

  if (isInstalled || dismissed) return null;

  const handleInstallClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (ok) setDismissed(true);
    } else {
      setShowPromptDialog(true);
    }
  };

  return (
    <>
      <div className="mb-5 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-gradient-to-r from-indigo-50 via-white to-violet-50 dark:from-indigo-950/60 dark:via-slate-900 dark:to-violet-950/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
              {lang === 'si' ? `${appName} ඔබේ උපාංගයට Install කරගන්න` : `Install ${appName} on Your Device`}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
              {lang === 'si'
                ? 'ඕනෑම දුරකථනයකට, ටැබ්ලටයකට හෝ පරිගණකයකට App එකක් ලෙස Install කර ඉක්මනින් පිවිසෙන්න.'
                : customMessage ||
                  'Install on Android, iPhone, iPad, or Desktop for one-tap access and offline study support.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleInstallClick}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            {t(lang, 'pwa_install_btn')}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            {t(lang, 'pwa_dismiss')}
          </button>
        </div>
      </div>

      {showPromptDialog && (
        <InstallConfirmModal
          lang={lang}
          appName={appName}
          isIOS={isIOS}
          isInstallable={isInstallable}
          onNativeInstall={async () => {
            const ok = await install();
            if (ok) {
              setShowPromptDialog(false);
              setDismissed(true);
            }
          }}
          onClose={() => setShowPromptDialog(false)}
        />
      )}
    </>
  );
};

const InstallConfirmModal: React.FC<{
  lang: UiLanguage;
  appName: string;
  isIOS: boolean;
  isInstallable: boolean;
  onNativeInstall: () => Promise<void>;
  onClose: () => void;
}> = ({ lang, appName, isIOS, isInstallable, onNativeInstall, onClose }) => {
  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
  const directInstallUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?install=1`
      : '/';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {lang === 'si' ? `${appName} Install කරන්නද?` : `Install ${appName}?`}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {typeof window !== 'undefined' ? window.location.host : 'smart-study-ai'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isIOS ? (
          <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-2 list-decimal pl-5 leading-relaxed">
            <li>
              {lang === 'si'
                ? 'Safari බ්‍රව්සරයේ Share (කොටු සහ ඊතල) බොත්තම ඔබන්න.'
                : 'Tap the Share button in the Safari toolbar.'}
            </li>
            <li>
              {lang === 'si'
                ? 'පහළට ගොස් "Add to Home Screen" තෝරන්න.'
                : 'Scroll down and tap "Add to Home Screen".'}
            </li>
            <li>
              {lang === 'si'
                ? 'ඉහළ දකුණේ "Add" ඔබන්න.'
                : 'Tap "Add" in the top right corner.'}
            </li>
          </ol>
        ) : (
          <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
            <p>
              {isInIframe
                ? lang === 'si'
                  ? 'ඔබ දැනට Preview Frame එකක් තුළ සිටින නිසා සෘජු Install පණිවිඩය පෙන්වීමට App එක නව ටැබ් එකකින් විවෘත කර "Install" ඔබන්න, නැතිනම් බ්‍රව්සරයේ Address bar හි Install අයිකනය ක්ලික් කරන්න.'
                  : 'Click "Install" below to open the app directly in a standalone browser tab where Chrome/Edge immediately prompts instant one-click installation (or click the Install icon in your browser address bar).'
                : lang === 'si'
                  ? 'ඔබේ උපාංගයට App එකක් ලෙස Install කිරීමට පහත "Install" ඔබන්න හෝ බ්‍රව්සරයේ Menu (⋮) → "Install app" තෝරන්න.'
                  : `Click "Install" to add ${appName} directly to your device, or choose Menu (⋮) → "Install app" in Chrome/Edge.`}
            </p>
          </div>
        )}

        {/* Matching native [Install] / [Not now] actions from user screenshot */}
        <div className="flex items-center justify-end gap-2.5 pt-1">
          {isInstallable ? (
            <button
              type="button"
              onClick={onNativeInstall}
              className="px-5 py-2 rounded-full border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer"
            >
              Install
            </button>
          ) : isInIframe && !isIOS ? (
            <a
              href={directInstallUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="px-5 py-2 rounded-full border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 cursor-pointer"
            >
              <span>Install</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
};

export const OfflineIndicator: React.FC<{ lang: UiLanguage }> = ({ lang }) => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg">
      <WifiOff className="w-3.5 h-3.5" />
      <span>{t(lang, 'pwa_offline')}</span>
    </div>
  );
};
