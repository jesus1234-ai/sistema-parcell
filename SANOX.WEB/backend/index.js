const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Habilitar CORS para que tu Frontend pueda hablar con este Backend
app.use(cors());
app.use(express.json());

// Ubicación del archivo de base de datos
const DB_FILE = path.join(__dirname, 'db.json');

// Función para inicializar la Base de Datos si no existe
function initDB() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            users: [{ username: 'sano4D', password: '123', role: 'administrador' }],
            almacenData: {},
            reportOptions: { sede: [], equipo: [], especificacion: [], metodoPago: [] },
            registros: { garantias: [], facturas: [] },
            pendingOrders: [] // Para los pedidos de la tienda
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
        console.log('Base de datos creada exitosamente.');
    }
}

// Función auxiliar para LEER la base de datos
const readDB = () => {
    try {
        if (!fs.existsSync(DB_FILE)) initDB();
        const data = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error leyendo DB:", error);
        return {};
    }
};

// Función auxiliar para ESCRIBIR en la base de datos
const writeDB = (data) => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error("Error escribiendo DB:", error);
        return false;
    }
};

// Inicializamos la DB al arrancar
initDB();

// --- RUTAS DEL SERVIDOR ---

// 1. Ruta de Prueba (Para saber si el servidor está vivo)
app.get('/', (req, res) => {
    res.send('Servidor Parcell Activo v1.0');
});

// 2. Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const db = readDB();
    const user = (db.users || []).find(u => u.username === username && u.password === password);
    
    if (user) {
        res.json({ username: user.username, role: user.role });
    } else {
        res.status(401).json({ error: 'Credenciales inválidas' });
    }
});

// 3. Crear Usuario
app.post('/users', (req, res) => {
    const { username, password, role } = req.body;
    const db = readDB();
    
    if (!db.users) db.users = [];
    if (db.users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'El usuario ya existe' });
    }
    
    db.users.push({ username, password, role });
    writeDB(db);
    res.json({ message: 'Usuario creado exitosamente' });
});

// 4. Obtener Lista de Usuarios (Para gestión de cuentas)
app.get('/users', (req, res) => {
    const db = readDB();
    // Devolvemos los usuarios pero SIN las contraseñas por seguridad
    const safeUsers = (db.users || []).map(u => ({ username: u.username, role: u.role }));
    res.json(safeUsers);
});

// 5. Eliminar Usuario
app.delete('/users/:username', (req, res) => {
    const { username } = req.params;
    const db = readDB();
    if(username === 'sano4D') return res.status(403).json({error: 'No se puede eliminar al admin raíz'});
    
    const initialLength = db.users.length;
    db.users = db.users.filter(u => u.username !== username);
    
    if (db.users.length < initialLength) {
        writeDB(db);
        res.json({ message: 'Usuario eliminado' });
    } else {
        res.status(404).json({ error: 'Usuario no encontrado' });
    }
});

// 6. Carga Inicial de Datos (Almacenes, Opciones, Pedidos)
app.get('/initial-data', (req, res) => {
    const db = readDB();
    res.json({
        almacenData: db.almacenData || {},
        reportOptions: db.reportOptions || {},
        pendingOrders: db.pendingOrders || []
    });
});

// 7. Guardar Registros (Facturas y Garantías)
app.post('/registros/:tipo', (req, res) => {
    const { tipo } = req.params; // 'factura' o 'garantia'
    const nuevoRegistro = req.body;
    const db = readDB();
    
    const key = tipo === 'factura' ? 'facturas' : 'garantias';
    if (!db.registros[key]) db.registros[key] = [];
    
    db.registros[key].push(nuevoRegistro);
    
    // DESCONTAR STOCK (Solo si es factura)
    if (tipo === 'factura' && nuevoRegistro.productos) {
        nuevoRegistro.productos.forEach(prod => {
            if(prod.codigo && prod.codigo !== 'N/A') {
                const sede = nuevoRegistro.sedeFacturacion;
                if(db.almacenData && db.almacenData[sede]) {
                    const pAlmacen = db.almacenData[sede].productos.find(p => p.codigo === prod.codigo);
                    if(pAlmacen) {
                        pAlmacen.stock = parseFloat(pAlmacen.stock) - parseFloat(prod.cantidad);
                    }
                }
            }
        });
    }

    writeDB(db);
    res.json({ message: 'Registro guardado y stock actualizado' });
});

// 8. Leer Buzón (Facturas y Garantías)
app.get('/registros/:tipo', (req, res) => {
    const { tipo } = req.params; 
    const { sede } = req.query;
    const db = readDB();
    
    let resultados = (db.registros && db.registros[tipo]) ? db.registros[tipo] : [];
    
    if (sede && sede !== 'Todas' && sede !== '') {
        resultados = resultados.filter(r => r.sedeFacturacion === sede);
    }
    res.json(resultados);
});

// 9. Eliminar Registro del Buzón
app.delete('/registros/:tipo/:id', (req, res) => {
    const { tipo, id } = req.params;
    const db = readDB();
    const idNum = Number(id); // Convertir a número
    
    const key = tipo; // 'facturas' o 'garantias' (ojo: app.js envía 'facturas', ruta recibe 'facturas')
    
    if (db.registros[key]) {
        db.registros[key] = db.registros[key].filter(r => r.id !== idNum);
        writeDB(db);
        res.json({ message: 'Registro eliminado' });
    } else {
        res.status(404).json({ error: 'Registro no encontrado o tipo inválido' });
    }
});

// 10. Gestión de Productos de Almacén
app.post('/almacen/:sede/productos', (req, res) => {
    const { sede } = req.params;
    const producto = req.body;
    const db = readDB();

    if (!db.almacenData) db.almacenData = {};
    if (!db.almacenData[sede]) {
        db.almacenData[sede] = { nombre: sede, productos: [] };
    }

    const prodExistente = db.almacenData[sede].productos.find(p => p.codigo === producto.codigo);
    if (prodExistente) {
        Object.assign(prodExistente, producto); // Actualizar
    } else {
        db.almacenData[sede].productos.push(producto); // Crear nuevo
    }

    writeDB(db);
    res.json({ message: 'Producto guardado correctamente' });
});

// 11. Eliminar Producto de Almacén
app.delete('/almacen/:sede/productos/:codigo', (req, res) => {
    const { sede, codigo } = req.params;
    const db = readDB();
    
    if (db.almacenData && db.almacenData[sede]) {
        db.almacenData[sede].productos = db.almacenData[sede].productos.filter(p => p.codigo !== codigo);
        writeDB(db);
        res.json({ message: 'Producto eliminado' });
    } else {
        res.status(404).json({ error: 'Almacén o producto no encontrado' });
    }
});

// 12. Eliminar Almacén Completo
app.delete('/almacen/:sede', (req, res) => {
    const { sede } = req.params;
    const db = readDB();
    
    if(db.almacenData && db.almacenData[sede]) {
        delete db.almacenData[sede];
        writeDB(db);
        res.json({ message: 'Almacén eliminado' });
    } else {
        res.status(404).json({error: 'Sede no encontrada'});
    }
});

// 13. Guardar Opciones de Informes
app.post('/options', (req, res) => {
    const options = req.body;
    const db = readDB();
    db.reportOptions = options;
    writeDB(db);
    res.json({ message: 'Opciones actualizadas' });
});

// 14. Pedidos Pendientes (Tienda -> Backend)
app.post('/orders', (req, res) => {
    const order = req.body;
    const db = readDB();
    if(!db.pendingOrders) db.pendingOrders = [];
    
    // Asignar ID único si no tiene
    order.id = Date.now();
    db.pendingOrders.push(order);
    writeDB(db);
    res.json({ message: 'Pedido recibido' });
});

app.delete('/orders/:id', (req, res) => {
    const id = Number(req.params.id);
    const db = readDB();
    if(db.pendingOrders) {
        db.pendingOrders = db.pendingOrders.filter(o => o.id !== id);
        writeDB(db);
        res.json({ message: 'Pedido procesado/eliminado' });
    } else {
        res.status(404).json({error: 'No hay pedidos'});
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor backend corriendo en puerto ${PORT}`);
});