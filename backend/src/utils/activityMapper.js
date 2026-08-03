// activityMapper.js
// Mapeia Ramos de Atividades do WinThor para CNAE e categorias do Geoapify

const activityMappings = {
    '1': { 
        ramo: 'PADARIA', 
        cnae: '1091102', // Fabricação de produtos de padaria e confeitaria 
        geoapify: 'commercial.food_and_drink.bakery' 
    },
    '2': { 
        ramo: 'RESTAURANTE / MARMITARIAS', 
        cnae: '5611201', // Restaurantes e similares
        geoapify: 'catering.restaurant' 
    },
    '3': { 
        ramo: 'PIZZARIAS', 
        cnae: '5611201', // Pode usar o mesmo de restaurante, ou pizzaria específico se tiver
        geoapify: 'catering.restaurant.pizza' 
    },
    '4': { 
        ramo: 'SUPERMERCADO / MINIMERCADO AC 7 CHECKOUT', 
        cnae: '4711302', // Comércio varejista de mercadorias em geral, com predominância de produtos alimentícios - supermercados
        geoapify: 'commercial.supermarket' 
    },
    '5': { 
        ramo: 'LANCHONETES / HAMBURGUERIAS', 
        cnae: '5611203', // Lanchonetes, casas de chá, de sucos e similares
        geoapify: 'catering.fast_food' 
    }
};

/**
 * Obtém os parâmetros de busca para o ramo de atividade
 * @param {string|number} codatv - Código do Ramo de Atividade no Winthor
 * @returns {object|null} - { cnae, geoapify }
 */
function getMapping(codatv) {
    const code = String(codatv);
    return activityMappings[code] || null;
}

module.exports = {
    getMapping,
    activityMappings
};
