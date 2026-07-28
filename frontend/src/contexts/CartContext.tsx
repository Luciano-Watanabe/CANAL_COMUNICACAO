import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

export interface CartItem {
  codprod: number;
  descricao: string;
  qt: number;
  pvenda: number;
  codcli: string;
  ean?: string;
}

interface CartContextData {
  items: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (codprod: number, codcli: string) => void;
  updateQuantity: (codprod: number, codcli: string, qt: number) => void;
  clearCart: (codcli?: string) => void;
  getCartTotal: (codcli: string) => number;
  getCartItems: (codcli: string) => CartItem[];
}

const CartContext = createContext<CartContextData>({} as CartContextData);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('canal_cart');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const today = new Date().toISOString().split('T')[0];
        if (parsed.date === today && Array.isArray(parsed.items)) {
          return parsed.items;
        }
      } catch (e) {
        console.error('Erro ao ler carrinho do localStorage', e);
      }
    }
    return [];
  });

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem('canal_cart', JSON.stringify({ date: today, items }));
  }, [items]);

  const addToCart = (newItem: CartItem) => {
    setItems((prev) => {
      const existing = prev.find(i => i.codprod === newItem.codprod && i.codcli === newItem.codcli);
      if (existing) {
        return prev.map(i => 
          (i.codprod === newItem.codprod && i.codcli === newItem.codcli) 
            ? { ...i, qt: i.qt + newItem.qt } 
            : i
        );
      }
      return [...prev, newItem];
    });
  };

  const removeFromCart = (codprod: number, codcli: string) => {
    setItems((prev) => prev.filter(i => !(i.codprod === codprod && i.codcli === codcli)));
  };

  const updateQuantity = (codprod: number, codcli: string, qt: number) => {
    if (qt <= 0) {
      removeFromCart(codprod, codcli);
      return;
    }
    setItems((prev) => prev.map(i => 
      (i.codprod === codprod && i.codcli === codcli) ? { ...i, qt } : i
    ));
  };

  const clearCart = (codcli?: string) => {
    if (codcli) {
      setItems((prev) => prev.filter(i => i.codcli !== codcli));
    } else {
      setItems([]);
    }
  };

  const getCartItems = (codcli: string) => {
    return items.filter(i => i.codcli === codcli);
  };

  const getCartTotal = (codcli: string) => {
    return items
      .filter(i => i.codcli === codcli)
      .reduce((total, item) => total + (item.qt * item.pvenda), 0);
  };

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, updateQuantity, clearCart, getCartTotal, getCartItems }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
