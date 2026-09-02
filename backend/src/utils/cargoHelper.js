/**
 * Helper para determinar o CARGO de um usuÃ¡rio baseado nas tabelas do banco
 * 
 * Regras:
 * - Se for de PCEMPR (Atendente SAC) = ATENDENTE
 * - Se existir em PCGERENTE = GERENTE
 * - Se existir em PCSUPERV = SUPERVISOR
 * - Caso contrÃ¡rio = VENDEDOR
 */

/**
 * Determina o CARGO de um usuÃ¡rio baseado nas tabelas do banco
 * @param {Object} connection - ConexÃ£o Oracle
 * @param {String} codusur - CÃ³digo do usuÃ¡rio
 * @param {Boolean} isAtendente - Se true, forÃ§a retornar ATENDENTE (usado para cadastros via PCEMPR)
 * @returns {Promise<String>} - Retorna: GERENTE, SUPERVISOR, VENDEDOR ou ATENDENTE
 */
async function determinarCargo(connection, codusur, isAtendente = false) {
    try {
        // Se Ã© atendente (vindo de PCEMPR), retorna ATENDENTE direto
        if (isAtendente) {
            return 'ATENDENTE';
        }

        // Verificar se Ã© GERENTE
        const resultGerente = await connection.execute(
            `SELECT 1 FROM PCGERENTE WHERE CODGERENTE = :codusur`,
            [codusur]
        );
        
        if (resultGerente.rows && resultGerente.rows.length > 0) {
            return 'GERENTE';
        }

        // Verificar se Ã© SUPERVISOR
        const resultSuperv = await connection.execute(
            `SELECT 1 FROM PCSUPERV WHERE CODSUPERVISOR = :codusur`,
            [codusur]
        );
        
        if (resultSuperv.rows && resultSuperv.rows.length > 0) {
            return 'SUPERVISOR';
        }

        // Se nÃ£o Ã© gerente nem supervisor, Ã© VENDEDOR
        return 'VENDEDOR';
        
    } catch (err) {
        console.error('Erro ao determinar cargo:', err);
        // Em caso de erro, retorna VENDEDOR como padrÃ£o
        return 'VENDEDOR';
    }
}

/**
 * Determina o CARGO de um usuÃ¡rio verificando tambÃ©m PCEMPR (Atendente)
 * Usado quando nÃ£o se sabe se o ID vem de PCUSUARI (CODUSUR) ou PCEMPR (MATRICULA)
 * @param {Object} connection - ConexÃ£o Oracle
 * @param {String} id - CÃ³digo do usuÃ¡rio (CODUSUR ou MATRICULA)
 * @returns {Promise<String>} - Retorna: ATENDENTE, GERENTE, SUPERVISOR ou VENDEDOR
 */
async function determinarCargoAuto(connection, id) {
    try {
        // Verificar se Ã© ATENDENTE (PCEMPR tem MATRICULA)
        const resultAtendente = await connection.execute(
            `SELECT 1 FROM PCEMPR WHERE MATRICULA = :id AND SITUACAO = 'A'`,
            [id]
        );
        if (resultAtendente.rows && resultAtendente.rows.length > 0) {
            return 'ATENDENTE';
        }

        // Verificar se Ã© GERENTE
        const resultGerente = await connection.execute(
            `SELECT 1 FROM PCGERENTE WHERE CODGERENTE = :id`,
            [id]
        );
        if (resultGerente.rows && resultGerente.rows.length > 0) {
            return 'GERENTE';
        }

        // Verificar se Ã© SUPERVISOR
        const resultSuperv = await connection.execute(
            `SELECT 1 FROM PCSUPERV WHERE CODSUPERVISOR = :id`,
            [id]
        );
        if (resultSuperv.rows && resultSuperv.rows.length > 0) {
            return 'SUPERVISOR';
        }

        // Se nÃ£o Ã© nenhum dos anteriores, Ã© VENDEDOR (PCUSUARI)
        return 'VENDEDOR';
        
    } catch (err) {
        console.error('Erro ao determinar cargo auto:', err);
        return 'VENDEDOR';
    }
}

/**
 * Busca todos os cargos possÃ­veis para um CODUSUR
 * Um usuÃ¡rio pode ter mÃºltiplos cargos (ex: ser VENDEDOR e SUPERVISOR)
 * @param {Object} connection - ConexÃ£o Oracle
 * @param {String} codusur - CÃ³digo do usuÃ¡rio
 * @returns {Promise<Array<String>>} - Array com os cargos encontrados
 */
async function buscarTodosCargos(connection, codusur) {
    const cargos = [];

    try {
        // Verificar GERENTE
        const resultGerente = await connection.execute(
            `SELECT 1 FROM PCGERENTE WHERE CODGERENTE = :codusur`,
            [codusur]
        );
        if (resultGerente.rows && resultGerente.rows.length > 0) {
            cargos.push('GERENTE');
        }

        // Verificar SUPERVISOR
        const resultSuperv = await connection.execute(
            `SELECT 1 FROM PCSUPERV WHERE CODSUPERVISOR = :codusur`,
            [codusur]
        );
        if (resultSuperv.rows && resultSuperv.rows.length > 0) {
            cargos.push('SUPERVISOR');
        }

        // Se nÃ£o achou nenhum cargo especÃ­fico, Ã© VENDEDOR
        if (cargos.length === 0) {
            cargos.push('VENDEDOR');
        }

    } catch (err) {
        console.error('Erro ao buscar todos os cargos:', err);
        // Em caso de erro, retorna VENDEDOR como padrÃ£o
        return ['VENDEDOR'];
    }

    return cargos;
}

module.exports = {
    determinarCargo,
    determinarCargoAuto,
    buscarTodosCargos
};
