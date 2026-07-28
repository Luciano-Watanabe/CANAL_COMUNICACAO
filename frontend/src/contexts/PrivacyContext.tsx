import { createContext, useContext, useState, useEffect } from 'react';
import { useSocket } from './SocketContext';

type PrivacyContextType = {
  isPrivacyMode: boolean;
  setPrivacyMode: (value: boolean) => void;
  maskData: (value: string | undefined | null) => string;
};

const PrivacyContext = createContext<PrivacyContextType>({
  isPrivacyMode: false,
  setPrivacyMode: () => {},
  maskData: (val) => val || '',
});

export const PrivacyProvider = ({ children }: { children: React.ReactNode }) => {
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const { socket } = useSocket();

  useEffect(() => {
    // Busca a config global ao carregar
    fetch('/api/config/global')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.configs['PRIVACY_MODE']) {
          setIsPrivacyMode(data.configs['PRIVACY_MODE'] === 'S');
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handlePrivacyChange = (data: { mode: boolean }) => {
      setIsPrivacyMode(data.mode);
    };
    socket.on('privacy_mode_changed', handlePrivacyChange);
    return () => {
      socket.off('privacy_mode_changed', handlePrivacyChange);
    };
  }, [socket]);

  const setPrivacyMode = async (value: boolean) => {
    // Atualiza localmente imediatamente para resposta rápida
    setIsPrivacyMode(value);
    
    // Salva globalmente no banco
    try {
      await fetch('/api/config/global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configs: { PRIVACY_MODE: value ? 'S' : 'N' }
        })
      });
    } catch (err) {
      console.error('Erro ao salvar privacy mode', err);
    }
  };

  const maskData = (value: string | undefined | null) => {
    if (!value) return '';
    if (!isPrivacyMode) return value;
    
    const strValue = String(value).trim();
    if (strValue.length <= 3) return strValue + '****';
    
    return strValue.substring(0, 3) + '****';
  };

  return (
    <PrivacyContext.Provider value={{ isPrivacyMode, setPrivacyMode, maskData }}>
      {children}
    </PrivacyContext.Provider>
  );
};

export const usePrivacy = () => useContext(PrivacyContext);
