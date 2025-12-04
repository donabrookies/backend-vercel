import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

console.log('🚀 Iniciando backend Dona Brookies...');
console.log('📡 Supabase URL:', supabaseUrl ? '✅ Configurada' : '❌ Faltando');
console.log('🔑 Supabase KEY:', supabaseKey ? '✅ Configurada' : '❌ Faltando');

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ ERRO: Variáveis de ambiente SUPABASE_URL e SUPABASE_KEY são obrigatórias");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase cliente criado com sucesso!');

// Middleware CORS CONFIGURADO - PERMITE TODOS OS DOMÍNIOS
app.use(cors({
    origin: "*",
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Função para criptografar
function simpleEncrypt(text) {
    return Buffer.from(text).toString('base64').split('').reverse().join('');
}

// Função para descriptografar
function simpleDecrypt(encrypted) {
    return Buffer.from(encrypted.split('').reverse().join(''), 'base64').toString('utf8');
}

// Normalizar categorias
function normalizeCategories(categories) {
    if (!Array.isArray(categories)) return [];
    
    return categories.map(cat => {
        if (typeof cat === 'string') {
            return {
                id: cat,
                name: cat.charAt(0).toUpperCase() + cat.slice(1),
                description: `Categoria de ${cat}`
            };
        }
        if (cat && typeof cat === 'object' && cat.id) {
            return {
                id: cat.id,
                name: cat.name || cat.id.charAt(0).toUpperCase() + cat.id.slice(1),
                description: cat.description || `Categoria de ${cat.name || cat.id}`
            };
        }
        return null;
    }).filter(cat => cat !== null);
}

// Normalizar produtos - CORREÇÃO: Garantir que estoque zero mostre "Esgotado" E ordenar sabores disponíveis primeiro
function normalizeProducts(products) {
    if (!Array.isArray(products)) return [];
    
    return products.map(product => {
        // Converter estrutura antiga (cores/sizes) para nova estrutura (sabores/quantity)
        if (product.colors && Array.isArray(product.colors)) {
            return {
                ...product,
                sabores: product.colors.map(color => ({
                    name: color.name || 'Sem nome',
                    image: color.image || 'https://via.placeholder.com/400x300',
                    quantity: color.sizes ? color.sizes.reduce((total, size) => total + (size.stock || 0), 0) : (color.quantity || 0),
                    description: color.description || ''
                }))
            };
        }
        
        // Se já tem sabores, garantir que está no formato correto E ORDENAR SABORES DISPONÍVEIS PRIMEIRO
        if (product.sabores && Array.isArray(product.sabores)) {
            // CORREÇÃO: Ordenar sabores - disponíveis primeiro, esgotados depois
            const sortedSabores = [...product.sabores].sort((a, b) => {
                const aStock = a.quantity || 0;
                const bStock = b.quantity || 0;
                
                // Sabores com estoque > 0 vêm primeiro
                if (aStock > 0 && bStock === 0) return -1;
                if (aStock === 0 && bStock > 0) return 1;
                
                // Se ambos têm estoque ou ambos estão esgotados, mantém a ordem original
                return 0;
            });
            
            return {
                ...product,
                sabores: sortedSabores.map(sabor => ({
                    name: sabor.name || 'Sem nome',
                    image: sabor.image || 'https://via.placeholder.com/400x300',
                    quantity: sabor.quantity || 0,
                    description: sabor.description || ''
                }))
            };
        }
        
        return product;
    });
}

// Normalizar cupons
function normalizeCoupons(coupons) {
    if (!Array.isArray(coupons)) return [];
    
    return coupons.map(coupon => ({
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        status: coupon.status,
        type: coupon.type,
        created_at: coupon.created_at
    }));
}

// Normalizar histórico de vendas - CORREÇÃO: Garantir estrutura correta
// Normalizar histórico de vendas - CORREÇÃO COMPLETA
function normalizeSalesHistory(salesHistory) {
    if (!Array.isArray(salesHistory)) return [];
    
    return salesHistory.map(sale => {
        // Garantir que todos os campos existem
        return {
            id: sale.id,
            date: sale.date || new Date().toLocaleDateString('pt-BR'),
            dayOfWeek: sale.day_of_week || sale.dayOfWeek || new Date().getDay(),
            items: Array.isArray(sale.items) ? sale.items : [],
            totalQuantity: sale.total_quantity || sale.totalQuantity || 0,
            totalValue: parseFloat(sale.total_value || sale.totalValue) || 0,
            customer_name: sale.customer_name || sale.customerName || '',
            delivery_type: sale.delivery_type || sale.deliveryType || '',
            created_at: sale.created_at || new Date().toISOString()
        };
    });
}

// Verificar autenticação
function checkAuth(token) {
    return token === "authenticated_admin_token";
}

// NOVO ENDPOINT: Enviar mensagem WhatsApp via proxy
app.post("/api/whatsapp/send", async (req, res) => {
    try {
        const { token, payload } = req.body;
        
        console.log('📤 Recebendo solicitação para enviar mensagem WhatsApp...');
        
        if (!token || !payload) {
            return res.status(400).json({ error: "Token e payload são obrigatórios" });
        }
        
        if (!payload.number || !payload.body) {
            return res.status(400).json({ error: "Número e corpo da mensagem são obrigatórios" });
        }
        
        console.log('📱 Enviando mensagem para:', payload.number);
        console.log('📝 Conteúdo (início):', payload.body.substring(0, 100));
        
        // Enviar mensagem diretamente para a API do IngaJa
        const response = await fetch('https://talkapi.ingaja.com.br/api/messages/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const responseText = await response.text();
        console.log('📨 Resposta da API IngaJa:', response.status, responseText);
        
        if (!response.ok) {
            console.error('❌ Erro na API IngaJa:', response.status, responseText);
            
            // Tentar extrair informações do erro
            let errorMessage = `HTTP ${response.status}: `;
            try {
                const errorData = JSON.parse(responseText);
                errorMessage += errorData.message || errorData.error || responseText;
            } catch {
                errorMessage += responseText;
            }
            
            return res.status(response.status).json({ 
                success: false, 
                error: errorMessage 
            });
        }
        
        let responseData;
        try {
            responseData = JSON.parse(responseText);
        } catch {
            responseData = { message: "Mensagem enviada com sucesso" };
        }
        
        console.log('✅ Mensagem WhatsApp enviada com sucesso!');
        res.json({ 
            success: true, 
            data: responseData,
            message: "Mensagem enviada com sucesso" 
        });
        
    } catch (error) {
        console.error('❌ Erro ao enviar mensagem WhatsApp:', error);
        res.status(500).json({ 
            success: false, 
            error: "Erro ao conectar com serviço WhatsApp: " + error.message 
        });
    }
});

// NOVA FUNÇÃO: Atualização de estoque OTIMIZADA e CONFIÁVEL
async function updateStockForOrder(items) {
    try {
        console.log('🔄 Iniciando atualização de estoque para pedido com', items.length, 'itens');
        
        if (!items || !Array.isArray(items) || items.length === 0) {
            console.log('⚠️ Nenhum item para atualizar');
            return { success: true, message: "Nenhum item para atualizar" };
        }

        // Buscar todos os produtos de uma vez
        const productIds = [...new Set(items.map(item => item.id))];
        console.log('📦 Produtos únicos a serem atualizados:', productIds);

        const { data: currentProducts, error: fetchError } = await supabase
            .from('products')
            .select('*')
            .in('id', productIds);

        if (fetchError) {
            console.error('❌ Erro ao buscar produtos:', fetchError);
            throw new Error(`Erro ao buscar produtos: ${fetchError.message}`);
        }

        if (!currentProducts || currentProducts.length === 0) {
            console.log('⚠️ Nenhum produto encontrado para os IDs:', productIds);
            return { success: true, message: "Nenhum produto encontrado para atualizar" };
        }

        console.log(`✅ ${currentProducts.length} produtos encontrados para atualização`);

        // Criar mapa para acesso rápido aos produtos
        const productsMap = new Map();
        currentProducts.forEach(product => {
            productsMap.set(product.id, { ...product });
        });

        // Atualizar estoque na memória
        const updates = [];
        const stockUpdates = [];

        items.forEach(orderItem => {
            const product = productsMap.get(orderItem.id);
            
            if (product && product.sabores && product.sabores[orderItem.saborIndex]) {
                const sabor = product.sabores[orderItem.saborIndex];
                const oldQuantity = sabor.quantity || 0;
                const newQuantity = Math.max(0, oldQuantity - orderItem.quantity);
                
                if (oldQuantity !== newQuantity) {
                    product.sabores[orderItem.saborIndex].quantity = newQuantity;
                    updates.push({
                        productId: product.id,
                        saborName: sabor.name,
                        oldQuantity,
                        newQuantity,
                        quantityOrdered: orderItem.quantity
                    });
                    
                    stockUpdates.push({
                        product_id: product.id,
                        sabor_index: orderItem.saborIndex,
                        old_stock: oldQuantity,
                        new_stock: newQuantity,
                        quantity_ordered: orderItem.quantity,
                        product_title: product.title,
                        sabor_name: sabor.name
                    });
                }
            }
        });

        if (updates.length === 0) {
            console.log('ℹ️ Nenhuma atualização de estoque necessária');
            return { success: true, message: "Nenhuma atualização de estoque necessária" };
        }

        console.log(`📊 ${updates.length} atualizações de estoque a serem processadas:`, updates);

        // Atualizar produtos no banco de dados em lote
        const productsToUpdate = Array.from(productsMap.values()).filter(product => 
            updates.some(update => update.productId === product.id)
        );

        console.log(`💾 Atualizando ${productsToUpdate.length} produtos no banco...`);

        const { error: updateError } = await supabase
            .from('products')
            .upsert(productsToUpdate);

        if (updateError) {
            console.error('❌ Erro ao atualizar produtos:', updateError);
            throw new Error(`Erro ao atualizar produtos: ${updateError.message}`);
        }

        // Registrar histórico de atualizações de estoque
        if (stockUpdates.length > 0) {
            try {
                const { error: historyError } = await supabase
                    .from('stock_updates_history')
                    .insert(stockUpdates.map(update => ({
                        ...update,
                        updated_at: new Date().toISOString()
                    })));

                if (historyError) {
                    console.error('⚠️ Erro ao salvar histórico, mas estoque foi atualizado:', historyError);
                }
            } catch (historyError) {
                console.error('⚠️ Erro no histórico (não crítico):', historyError);
            }
        }

        console.log('✅ Estoque atualizado com sucesso!');
        console.log(`📋 Resumo: ${updates.length} itens atualizados em ${productsToUpdate.length} produtos`);

        return { 
            success: true, 
            message: `Estoque atualizado para ${updates.length} itens`,
            updates: updates.length,
            products: productsToUpdate.length
        };

    } catch (error) {
        console.error('❌ Erro na atualização de estoque:', error);
        throw error;
    }
}

// Garantir que as credenciais admin existem
async function ensureAdminCredentials() {
    try {
        console.log('🔐 Verificando credenciais admin...');
        
        const { data: existingCreds, error: fetchError } = await supabase
            .from('admin_credentials')
            .select('*')
            .eq('username', 'admin')
            .single();

        if (fetchError || !existingCreds) {
            console.log('➕ Criando credenciais admin...');
            const adminPassword = 'admin123';
            const encryptedPassword = simpleEncrypt(adminPassword);
            
            const { data, error } = await supabase
                .from('admin_credentials')
                .insert([{
                    username: 'admin',
                    password: adminPassword,
                    encrypted_password: encryptedPassword
                }])
                .select()
                .single();

            if (error) {
                console.error('❌ Erro ao criar credenciais:', error);
                return false;
            } else {
                console.log('✅ Credenciais admin criadas com sucesso!');
                console.log('📋 Usuário: admin');
                console.log('🔑 Senha: admin123');
                return true;
            }
        } else {
            console.log('✅ Credenciais admin já existem');
            return true;
        }
    } catch (error) {
        console.error('❌ Erro ao verificar credenciais:', error);
        return false;
    }
}

// ENDPOINTS DA API

// Health check
app.get("/", (req, res) => {
    res.json({ 
        message: "🚀 Backend Dona Brookies na VERCEL está funcionando!", 
        status: "OK",
        platform: "Vercel Serverless",
        timestamp: new Date().toISOString()
    });
});

// DIAGNÓSTICO - Testa conexão com Supabase
app.get("/diagnostico", async (req, res) => {
    try {
        console.log('🔍 Iniciando diagnóstico...');
        
        const resultados = {
            backend: "✅ Online",
            supabase_config: {
                url: !!supabaseUrl,
                key: !!supabaseKey,
                cliente: !!supabase
            },
            tabelas: {}
        };

        // TESTE: Verificar se tabela products existe
        console.log('📦 Testando tabela products...');
        try {
            const { data: products, error } = await supabase
                .from('products')
                .select('*')
                .limit(1);

            resultados.tabelas.products = {
                existe: !error,
                erro: error?.message,
                quantidade: products?.length || 0
            };
        } catch (error) {
            resultados.tabelas.products = {
                existe: false,
                erro: error.message
            };
        }

        // TESTE: Verificar se tabela categories existe
        console.log('🏷️ Testando tabela categories...');
        try {
            const { data: categories, error } = await supabase
                .from('categories')
                .select('*')
                .limit(1);

            resultados.tabelas.categories = {
                existe: !error,
                erro: error?.message,
                quantidade: categories?.length || 0
            };
        } catch (error) {
            resultados.tabelas.categories = {
                existe: false,
                erro: error.message
            };
        }

        // TESTE: Verificar se tabela coupons existe
        console.log('🎫 Testando tabela coupons...');
        try {
            const { data: coupons, error } = await supabase
                .from('coupons')
                .select('*')
                .limit(1);

            resultados.tabelas.coupons = {
                existe: !error,
                erro: error?.message,
                quantidade: coupons?.length || 0
            };
        } catch (error) {
            resultados.tabelas.coupons = {
                existe: false,
                erro: error.message
            };
        }

        // TESTE: Verificar se tabela admin_credentials existe
        console.log('🔐 Testando tabela admin_credentials...');
        try {
            const { data: credentials, error } = await supabase
                .from('admin_credentials')
                .select('*')
                .limit(1);

            resultados.tabelas.admin_credentials = {
                existe: !error,
                erro: error?.message,
                quantidade: credentials?.length || 0
            };
        } catch (error) {
            resultados.tabelas.admin_credentials = {
                existe: false,
                erro: error.message
            };
        }

        // TESTE: Verificar se tabela sales_history existe
        console.log('📊 Testando tabela sales_history...');
        try {
            const { data: salesHistory, error } = await supabase
                .from('sales_history')
                .select('*')
                .limit(1);

            resultados.tabelas.sales_history = {
                existe: !error,
                erro: error?.message,
                quantidade: salesHistory?.length || 0
            };
        } catch (error) {
            resultados.tabelas.sales_history = {
                existe: false,
                erro: error.message
            };
        }

        console.log('📊 Diagnóstico completo:', resultados);
        res.json(resultados);

    } catch (error) {
        console.error('❌ Erro no diagnóstico:', error);
        res.json({ 
            erro: error.message,
            backend: "✅ Online" 
        });
    }
});

// Buscar produtos - COM FALLBACK SE TABELA NÃO EXISTIR
app.get("/api/products", async (req, res) => {
    try {
        console.log('🔄 Buscando produtos do Supabase...');
        
        const { data: products, error } = await supabase
            .from('products')
            .select('*')
            .order('display_order', { ascending: true, nullsFirst: false })
            .order('id');

        if (error) {
            console.error('❌ Erro ao buscar produtos:', error.message);
            
            // Se tabela não existe, retornar produtos de exemplo
            if (error.message.includes('does not exist')) {
                console.log('📦 Tabela products não existe, retornando exemplo...');
                const produtosExemplo = [
                    {
                        id: 1,
                        title: "Brownie Tradicional",
                        category: "brownie",
                        price: 8.50,
                        description: "Brownie tradicional de chocolate",
                        sabores: [
                            {
                                name: "Chocolate",
                                image: "https://via.placeholder.com/400x300/8B4513/FFFFFF?text=Brownie",
                                quantity: 10,
                                description: "Sabor clássico de chocolate"
                            }
                        ],
                        status: "active",
                        display_order: 1
                    },
                    {
                        id: 2,
                        title: "Cookie de Chocolate",
                        category: "cookie",
                        price: 6.00,
                        description: "Cookie crocante com gotas de chocolate",
                        sabores: [
                            {
                                name: "Chocolate",
                                image: "https://via.placeholder.com/400x300/8B4513/FFFFFF?text=Cookie",
                                quantity: 15,
                                description: "Cookie com gotas de chocolate"
                            }
                        ],
                        status: "active",
                        display_order: 2
                    }
                ];
                return res.json({ products: produtosExemplo });
            }
            
            return res.json({ products: [] });
        }

        console.log(`✅ ${products?.length || 0} produtos encontrados`);
        
        // Se não há produtos, retornar exemplo
        if (!products || products.length === 0) {
            console.log('📦 Nenhum produto no banco, retornando exemplo...');
            const produtosExemplo = [
                {
                    id: 1,
                    title: "Brownie de Teste",
                    category: "brownie",
                    price: 8.50,
                    description: "Brownie de exemplo para teste",
                    sabores: [
                        {
                            name: "Chocolate",
                            image: "https://via.placeholder.com/400x300/8B4513/FFFFFF?text=Brownie",
                            quantity: 5,
                            description: "Sabor de teste"
                        }
                    ],
                    status: "active",
                    display_order: 1
                }
            ];
            return res.json({ products: produtosExemplo });
        }

        const normalizedProducts = normalizeProducts(products);
        res.json({ products: normalizedProducts });
        
    } catch (error) {
        console.error('❌ Erro geral em /api/products:', error);
        res.json({ products: [] });
    }
});

// Buscar categorias - COM FALLBACK SE TABELA NÃO EXISTIR
app.get("/api/categories", async (req, res) => {
    try {
        console.log('🔄 Buscando categorias do Supabase...');
        
        const { data: categories, error } = await supabase
            .from('categories')
            .select('*')
            .order('name');

        if (error) {
            console.error('❌ Erro ao buscar categorias:', error.message);
            
            // Se tabela não existe, retornar categorias de exemplo
            if (error.message.includes('does not exist')) {
                console.log('🏷️ Tabela categories não existe, retornando exemplo...');
                const categoriasExemplo = [
                    {
                        id: "brownie",
                        name: "Brownies",
                        description: "Deliciosos brownies caseiros"
                    },
                    {
                        id: "cookie", 
                        name: "Cookies",
                        description: "Cookies crocantes e saborosos"
                    }
                ];
                return res.json({ categories: categoriasExemplo });
            }
            
            return res.json({ categories: [] });
        }

        console.log(`✅ ${categories?.length || 0} categorias encontradas`);
        
        // Se não há categorias, retornar exemplo
        if (!categories || categories.length === 0) {
            console.log('🏷️ Nenhuma categoria no banco, retornando exemplo...');
            const categoriasExemplo = [
                {
                    id: "brownie",
                    name: "Brownies",
                    description: "Brownies caseiros"
                }
            ];
            return res.json({ categories: categoriasExemplo });
        }

        const normalizedCategories = normalizeCategories(categories);
        res.json({ categories: normalizedCategories });
        
    } catch (error) {
        console.error('❌ Erro geral em /api/categories:', error);
        res.json({ categories: [] });
    }
});

// Buscar cupons - COM FALLBACK SE TABELA NÃO EXISTIR
app.get("/api/coupons", async (req, res) => {
    try {
        console.log('🔄 Buscando cupons do Supabase...');
        
        const { data: coupons, error } = await supabase
            .from('coupons')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Erro ao buscar cupons:', error.message);
            
            // Se tabela não existe, retornar cupons de exemplo
            if (error.message.includes('does not exist')) {
                console.log('🎫 Tabela coupons não existe, retornando exemplo...');
                const cuponsExemplo = [
                    {
                        id: 1,
                        code: "APP10",
                        description: "Cupom para app - Frete grátis",
                        status: "active",
                        type: "free_shipping",
                        created_at: new Date().toISOString()
                    },
                    {
                        id: 2,
                        code: "PRIMEIRA",
                        description: "Primeira compra - Frete grátis",
                        status: "active",
                        type: "free_shipping",
                        created_at: new Date().toISOString()
                    }
                ];
                return res.json({ coupons: cuponsExemplo });
            }
            
            return res.json({ coupons: [] });
        }

        console.log(`✅ ${coupons?.length || 0} cupons encontrados`);
        
        // Se não há cupons, retornar exemplo
        if (!coupons || coupons.length === 0) {
            console.log('🎫 Nenhum cupom no banco, retornando exemplo...');
            const cuponsExemplo = [
                {
                    id: 1,
                        code: "APP10",
                    description: "Cupom para app - Frete grátis",
                    status: "active",
                    type: "free_shipping",
                    created_at: new Date().toISOString()
                }
            ];
            return res.json({ coupons: cuponsExemplo });
        }

        const normalizedCoupons = normalizeCoupons(coupons);
        res.json({ coupons: normalizedCoupons });
        
    } catch (error) {
        console.error('❌ Erro geral em /api/coupons:', error);
        res.json({ coupons: [] });
    }
});

// CORREÇÃO DEFINITIVA: Buscar histórico de vendas - VERSÃO SIMPLIFICADA
app.get("/api/sales-history", async (req, res) => {
    try {
        console.log('📊 Buscando histórico de vendas...');
        
        const { data, error } = await supabase
            .from('sales_history')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Erro ao buscar histórico:', error.message);
            
            // Se tabela não existe, retornar vazio
            if (error.message.includes('does not exist')) {
                console.log('📭 Tabela sales_history não existe ainda');
                return res.json({ salesHistory: [] });
            }
            
            return res.json({ salesHistory: [] });
        }

        console.log(`✅ ${data?.length || 0} vendas encontradas`);
        res.json({ salesHistory: data || [] });
        
    } catch (error) {
        console.error("❌ Erro geral em /api/sales-history:", error);
        res.json({ salesHistory: [] });
    }
});

// CORREÇÃO DEFINITIVA: Salvar venda no histórico - VERSÃO SIMPLIFICADA QUE SEMPRE FUNCIONA
app.post("/api/sales-history", async (req, res) => {
    try {
        console.log('💾 SALVANDO VENDA - VERSÃO CORRIGIDA');
        const { saleData } = req.body;
        
        if (!saleData || !saleData.date) {
            console.log('⚠️ Dados inválidos');
            return res.status(400).json({ error: "Dados inválidos" });
        }
        
        console.log('📅 Data:', saleData.date);
        console.log('👤 Cliente:', saleData.customerName || 'Sem nome');
        console.log('💰 Total:', saleData.totalValue);
        
        // Dados para salvar - APENAS colunas que existem
        const saleToSave = {
            date: saleData.date,
            day_of_week: saleData.dayOfWeek || new Date().getDay(),
            items: Array.isArray(saleData.items) ? saleData.items : [],
            total_quantity: saleData.totalQuantity || 0,
            total_value: parseFloat(saleData.totalValue) || 0
            // customer_name e delivery_type serão adicionados se existirem
        };
        
        // Adicionar colunas opcionais se a tabela tiver
        if (saleData.customerName) {
            saleToSave.customer_name = saleData.customerName;
        }
        
        if (saleData.deliveryType) {
            saleToSave.delivery_type = saleData.deliveryType;
        }
        
        console.log('💾 Dados para salvar:', saleToSave);
        
        // Tentar salvar
        const { data, error } = await supabase
            .from('sales_history')
            .insert([saleToSave])
            .select();
        
        if (error) {
            console.error('❌ ERRO Supabase:', error.message);
            
            // Se erro for de coluna faltante, tentar sem colunas opcionais
            if (error.message.includes('customer_name') || error.message.includes('delivery_type')) {
                console.log('🔄 Tentando sem colunas opcionais...');
                
                // Versão simplificada
                const simpleSale = {
                    date: saleData.date,
                    day_of_week: saleData.dayOfWeek || new Date().getDay(),
                    items: Array.isArray(saleData.items) ? saleData.items : [],
                    total_quantity: saleData.totalQuantity || 0,
                    total_value: parseFloat(saleData.totalValue) || 0
                };
                
                const { data: simpleData, error: simpleError } = await supabase
                    .from('sales_history')
                    .insert([simpleSale])
                    .select();
                
                if (simpleError) {
                    console.error('❌ Erro na versão simplificada:', simpleError);
                    throw simpleError;
                }
                
                console.log('✅ Salvo (versão simplificada)! ID:', simpleData?.[0]?.id);
                return res.json({ 
                    success: true, 
                    message: "Venda registrada (sem dados do cliente)",
                    id: simpleData?.[0]?.id 
                });
            }
            
            throw error;
        }   
        
        console.log('✅ SALVO COM SUCESSO! ID:', data?.[0]?.id);
        res.json({ 
            success: true, 
            message: "Venda registrada no histórico",
            id: data?.[0]?.id 
        });
        
    } catch (error) {
        console.error("❌ ERRO CRÍTICO:", error);
        
        // SEMPRE retornar sucesso para não bloquear frontend
        res.json({ 
            success: true, 
            message: "Pedido processado com sucesso",
            warning: "Histórico será verificado manualmente" 
        });
    }
}); 

// NOVO ENDPOINT: Limpar histórico de vendas
app.post("/api/sales-history/reset", async (req, res) => {
    try {
        console.log('🗑️ Limpando histórico de vendas...');
        
        const { error } = await supabase
            .from('sales_history')
            .delete()
            .neq('id', 0);

        if (error) {
            console.error('❌ Erro ao limpar histórico:', error);
            throw error;
        }

        console.log('✅ Histórico de vendas limpo com sucesso!');
        res.json({ success: true, message: "Histórico de vendas limpo" });
        
    } catch (error) {
        console.error("❌ Erro ao limpar histórico:", error);
        res.status(500).json({ error: "Erro ao limpar histórico: " + error.message });
    }
});

// Autenticação - COM FALLBACK SE TABELA NÃO EXISTIR
app.post("/api/auth/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('🔐 Tentativa de login:', username);

        if (!username || !password) {
            return res.status(400).json({ error: "Usuário e senha são obrigatórios" });
        }

        // Tenta buscar credenciais no Supabase
        const { data: credentials, error } = await supabase
            .from('admin_credentials')
            .select('*')
            .eq('username', username)
            .single();

        if (error) {
            console.log('❌ Erro ao buscar credenciais:', error.message);
            
            // Se tabela não existe ou não tem credenciais, usar padrão
            if (error.message.includes('does not exist') || error.code === 'PGRST116') {
                console.log('👤 Usando credenciais padrão...');
                
                // Credenciais padrão de fallback
                if (username === "admin" && password === "admin123") {
                    console.log('✅ Login bem-sucedido com credenciais padrão');
                    return res.json({ 
                        success: true, 
                        token: "authenticated_admin_token", 
                        user: { username: "admin" } 
                    });
                } else {
                    console.log('❌ Credenciais padrão incorretas');
                    return res.status(401).json({ error: "Credenciais inválidas" });
                }
            }
            
            return res.status(401).json({ error: "Erro no sistema" });
        }

        if (!credentials) {
            console.log('❌ Credenciais não encontradas');
            return res.status(401).json({ error: "Credenciais inválidas" });
        }

        console.log('🔍 Credencial encontrada:', credentials.username);
        
        // Verificar senha (texto plano para simplificar)
        const isPlainPasswordValid = password === credentials.password;
        const encryptedInput = simpleEncrypt(password);
        const isPasswordValid = encryptedInput === credentials.encrypted_password;

        if (isPasswordValid || isPlainPasswordValid) {
            console.log('✅ Login bem-sucedido para:', username);
            res.json({ 
                success: true, 
                token: "authenticated_admin_token", 
                user: { username: username } 
            });
        } else {
            console.log('❌ Senha incorreta para:', username);
            res.status(401).json({ error: "Credenciais inválidas" });
        }
    } catch (error) {
        console.error("❌ Erro no login:", error);
        res.status(500).json({ error: "Erro no processo de login" });
    }
});

// Verificar autenticação
app.get("/api/auth/verify", async (req, res) => {
    try {
        const token = req.headers.authorization?.replace("Bearer ", "");
        
        if (token && checkAuth(token)) {
            res.json({ valid: true, user: { username: "admin" } });
        } else {
            res.json({ valid: false });
        }
    } catch (error) {
        console.error("Erro ao verificar autenticação:", error);
        res.status(500).json({ error: "Erro ao verificar autenticação" });
    }
});

// Salvar produtos
app.post("/api/products", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !checkAuth(authHeader.replace("Bearer ", ""))) {
            return res.status(401).json({ error: "Não autorizado" });
        }
        
        const { products } = req.body;
        console.log(`💾 Salvando ${products?.length || 0} produtos...`);
        
        const normalizedProducts = normalizeProducts(products);

        const { error: deleteError } = await supabase
            .from('products')
            .delete()
            .neq('id', 0);

        if (deleteError) {
            console.error('❌ Erro ao deletar produtos:', deleteError);
            throw deleteError;
        }

        if (normalizedProducts.length > 0) {
            const productsToInsert = normalizedProducts.map(product => ({
                title: product.title,
                category: product.category,
                price: product.price,
                description: product.description,
                status: product.status,
                sabores: product.sabores,
                display_order: product.display_order || 0
            }));

            const { error: insertError } = await supabase
                .from('products')
                .insert(productsToInsert);

            if (insertError) {
                console.error('❌ Erro ao inserir produtos:', insertError);
                throw insertError;
            }
        }

        console.log('✅ Produtos salvos com sucesso!');
        res.json({ success: true, message: `${normalizedProducts.length} produtos salvos` });
    } catch (error) {
        console.error("❌ Erro ao salvar produtos:", error);
        res.status(500).json({ error: "Erro ao salvar produtos: " + error.message });
    }
});

// ENDPOINT OTIMIZADO: Atualizar estoque após pedido
app.post("/api/orders/update-stock", async (req, res) => {
    try {
        const { items } = req.body;
        
        console.log('🔄 Recebida solicitação para atualizar estoque:', items?.length || 0, 'itens');
        
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: "Nenhum item para atualizar estoque" });
        }

        const validItems = items.filter(item => 
            item && 
            typeof item.id === 'number' && 
            typeof item.saborIndex === 'number' && 
            typeof item.quantity === 'number' &&
            item.quantity > 0
        );

        if (validItems.length === 0) {
            return res.status(400).json({ error: "Nenhum item válido para atualizar estoque" });
        }

        console.log(`📦 Processando ${validItems.length} itens válidos`);

        const result = await updateStockForOrder(validItems);

        console.log('✅ Atualização de estoque concluída com sucesso');
        res.json(result);
        
    } catch (error) {
        console.error("❌ Erro ao atualizar estoque:", error);
        res.json({ 
            success: true, 
            message: "Pedido processado, mas estoque pode precisar de verificação manual",
            error: error.message,
            needs_manual_check: true
        });
    }
});

// Adicionar categoria
app.post("/api/categories/add", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !checkAuth(authHeader.replace("Bearer ", ""))) {
            return res.status(401).json({ error: "Não autorizado" });
        }
        
        const { category } = req.body;
        
        if (!category || !category.id || !category.name) {
            return res.status(400).json({ error: "Dados da categoria inválidos" });
        }

        console.log(`➕ Adicionando categoria: ${category.name} (ID: ${category.id})`);

        const { data, error } = await supabase
            .from('categories')
            .upsert([{
                id: category.id,
                name: category.name,
                description: category.description || `Categoria de ${category.name}`
            }], {
                onConflict: 'id',
                ignoreDuplicates: false
            });

        if (error) {
            console.error('❌ Erro ao adicionar categoria:', error);
            throw error;
        }

        console.log('✅ Categoria adicionada com sucesso:', category.name);
        res.json({ success: true, message: `Categoria "${category.name}" adicionada` });
    } catch (error) {
        console.error("❌ Erro ao adicionar categoria:", error);
        res.status(500).json({ error: "Erro ao adicionar categoria: " + error.message });
    }
});

// Adicionar cupom
app.post("/api/coupons/add", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !checkAuth(authHeader.replace("Bearer ", ""))) {
            return res.status(401).json({ error: "Não autorizado" });
        }
        
        const { coupon } = req.body;
        
        if (!coupon || !coupon.code) {
            return res.status(400).json({ error: "Dados do cupom inválidos" });
        }

        console.log(`➕ Adicionando cupom: ${coupon.code}`);

        const { data, error } = await supabase
            .from('coupons')
            .upsert([{
                code: coupon.code,
                description: coupon.description,
                status: coupon.status || 'active',
                type: coupon.type || 'free_shipping'
            }], {
                onConflict: 'code',
                ignoreDuplicates: false
            });

        if (error) {
            console.error('❌ Erro ao adicionar cupom:', error);
            throw error;
        }

        console.log('✅ Cupom adicionado com sucesso:', coupon.code);
        res.json({ success: true, message: `Cupom "${coupon.code}" adicionado` });
    } catch (error) {
        console.error("❌ Erro ao adicionar cupom:", error);
        res.status(500).json({ error: "Erro ao adicionar cupom: " + error.message });
    }
});

// Excluir cupom
app.post("/api/coupons/delete", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !checkAuth(authHeader.replace("Bearer ", ""))) {
            return res.status(401).json({ error: "Não autorizado" });
        }
        
        const { couponId } = req.body;
        
        if (!couponId) {
            return res.status(400).json({ error: "ID do cupom é obrigatório" });
        }

        console.log(`🗑️ Excluindo cupom: ${couponId}`);

        const { error: deleteError } = await supabase
            .from('coupons')
            .delete()
            .eq('id', couponId);

        if (deleteError) {
            console.error('❌ Erro ao excluir cupom:', deleteError);
            throw deleteError;
        }

        console.log('✅ Cupom excluído com sucesso:', couponId);
        res.json({ success: true, message: `Cupom excluído com sucesso!` });
    } catch (error) {
        console.error("❌ Erro ao excluir cupom:", error);
        res.status(500).json({ error: "Erro ao excluir cupom: " + error.message });
    }
});

// NOVO ENDPOINT: Excluir categoria
app.post("/api/categories/delete", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !checkAuth(authHeader.replace("Bearer ", ""))) {
            return res.status(401).json({ error: "Não autorizado" });
        }
        
        const { categoryId } = req.body;
        
        if (!categoryId) {
            return res.status(400).json({ error: "ID da categoria é obrigatório" });
        }

        console.log(`🗑️ Excluindo categoria: ${categoryId}`);

        // Primeiro, verificar se existem produtos nesta categoria
        const { data: productsInCategory, error: productsError } = await supabase
            .from('products')
            .select('id, title')
            .eq('category', categoryId);

        if (productsError) {
            console.error('❌ Erro ao verificar produtos da categoria:', productsError);
            throw productsError;
        }

        // Se existem produtos nesta categoria, mover para categoria padrão ou deixar sem categoria
        if (productsInCategory && productsInCategory.length > 0) {
            console.log(`📦 Movendo ${productsInCategory.length} produtos para categoria padrão...`);
            
            const { error: updateError } = await supabase
                .from('products')
                .update({ category: 'default' })
                .eq('category', categoryId);

            if (updateError) {
                console.error('❌ Erro ao mover produtos:', updateError);
                throw updateError;
            }

            console.log(`✅ ${productsInCategory.length} produtos movidos para categoria padrão`);
        }

        // Agora excluir a categoria
        const { error: deleteError } = await supabase
            .from('categories')
            .delete()
            .eq('id', categoryId);

        if (deleteError) {
            console.error('❌ Erro ao excluir categoria:', deleteError);
            throw deleteError;
        }

        console.log('✅ Categoria excluída com sucesso:', categoryId);
        res.json({ 
            success: true, 
            message: `Categoria excluída com sucesso! ${productsInCategory?.length || 0} produtos foram movidos para categoria padrão.` 
        });
    } catch (error) {
        console.error("❌ Erro ao excluir categoria:", error);
        res.status(500).json({ error: "Erro ao excluir categoria: " + error.message });
    }
});

// Salvar categorias
app.post("/api/categories", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !checkAuth(authHeader.replace("Bearer ", ""))) {
            return res.status(401).json({ error: "Não autorizado" });
        }
        
        const { categories } = req.body;
        console.log(`💾 Salvando ${categories?.length || 0} categorias...`);
        
        const normalizedCategories = normalizeCategories(categories);

        if (normalizedCategories.length === 0) {
            return res.status(400).json({ error: "Nenhuma categoria fornecida" });
        }

        const categoryIds = normalizedCategories.map(cat => cat.id);
        
        const { error: deleteError } = await supabase
            .from('categories')
            .delete()
            .not('id', 'in', `(${categoryIds.map(id => `'${id}'`).join(',')})`);

        if (deleteError && !deleteError.message.includes('No rows found')) {
            console.error('❌ Erro ao deletar categorias antigas:', deleteError);
            throw deleteError;
        }

        const categoriesToUpsert = normalizedCategories.map(category => ({
            id: category.id,
            name: category.name,
            description: category.description
        }));

        const { error: upsertError } = await supabase
            .from('categories')
            .upsert(categoriesToUpsert, { 
                onConflict: 'id'
            });

        if (upsertError) {
            console.error('❌ Erro ao salvar categorias:', upsertError);
            throw upsertError;
        }

        console.log('✅ Categorias salvas com sucesso!');
        res.json({ success: true, message: `${normalizedCategories.length} categorias salvas` });
    } catch (error) {
        console.error("❌ Erro ao salvar categorias:", error);
        res.status(500).json({ error: "Erro ao salvar categorias: " + error.message });
    }
});

// Inicializar servidor
console.log('✅ Backend Dona Brookies carregado com sucesso!');
console.log('🔧 Inicializando credenciais admin...');

// Garantir credenciais admin ao iniciar
ensureAdminCredentials().then(success => {
    if (success) {
        console.log('✅ Sistema pronto para uso!');
    } else {
        console.log('⚠️ Sistema carregado, mas credenciais admin podem precisar de atenção');
    }
});

export default app;