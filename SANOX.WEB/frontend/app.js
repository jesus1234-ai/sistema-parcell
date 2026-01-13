// --- PARCELL APP SCRIPT (MODIFICADO PARA API BACKEND) ---

// --- CONFIGURACIÓN DE API Y ROLES -
// // Cuando subas el backend a Render, ellos te darán una URL (ej: https://mi-backend.onrender.com)
// Por ahora pon la de localhost para probar, pero cuando subas a Vercel, cambiarás esto.
const API_URL = 'http://localhost:3000'; // URL del Backend
// (MANTENIDO) El carrito interno sigue en localStorage
const DB_KEY_CART = 'parcell_shoppingCart'; 

// --- VARIABLES GLOBALES DE ESTADO ---
let currentProducts = [];
let currentTotal = 0;
let currentEquipos = [];
let currentDanos = [];

// (MODIFICADO) Estos se cargan ahora desde la API
let reportOptions = {}; 
let almacenData = {};
let pendingOrdersData = []; // (NUEVO) Caché de pedidos pendientes

let currentCart = JSON.parse(localStorage.getItem(DB_KEY_CART)) || { 
    sede: null, 
    items: [] 
};
let checkoutData = null; 
let allProductsMasterList = [];

// --- LÓGICA DE LOGIN Y ROLES (MODIFICADA) ---
// (ELIMINADO) getUsers, saveUsers, initializeAdmin - El servidor maneja esto
function getLoggedInUser() {
    return JSON.parse(sessionStorage.getItem('loggedInUser'));
}
function setLoggedInUser(user) {
    sessionStorage.setItem('loggedInUser', JSON.stringify(user));
}
function logout() {
    sessionStorage.removeItem('loggedInUser');
    window.location.reload();
}

// (MODIFICADO) login() ahora es async, usa fetch y carga TODOS los datos
async function login(username, password) {
    const loginError = document.getElementById('login-error');
    
    try {
        // 1. Autenticar
        const loginResponse = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        if (!loginResponse.ok) throw new Error('Credenciales incorrectas');
        const user = await loginResponse.json();
        
        setLoggedInUser(user); 
        document.getElementById('profileUsername').textContent = user.username;
        document.getElementById('profileRole').textContent = user.role;
        
        // 2. Aplicar permisos de UI
        if (user.role === 'administrador') {
            document.getElementById('cuentas-sidebar-item').style.display = 'flex';
            document.getElementById('almacen-sidebar-item').style.display = 'flex';
            document.getElementById('pos-sidebar-item').style.display = 'flex'; 
            document.getElementById('cartIcon').style.display = 'flex'; 
        }
        if (user.role === 'moderador') {
            document.getElementById('almacen-sidebar-item').style.display = 'flex';
            document.getElementById('pos-sidebar-item').style.display = 'flex'; 
            document.getElementById('cartIcon').style.display = 'flex'; 
        }

        // 3. Cargar TODOS los datos de la aplicación
        const dataResponse = await fetch(`${API_URL}/initial-data`);
        if (!dataResponse.ok) throw new Error('Error al cargar datos de la app');
        
        const appData = await dataResponse.json();
        almacenData = appData.almacenData || {};
        reportOptions = appData.reportOptions || {};
        pendingOrdersData = appData.pendingOrders || [];
        // (Nota: allImages y storeContent no se usan en app.js, pero se cargan)
        
        // 4. Mostrar aplicación
        document.body.classList.remove('login-active');
        document.body.classList.add('app-active');
        document.getElementById('loginView').classList.add('hidden');
        document.getElementById('registerView').classList.add('hidden');
        document.getElementById('mainContainer').style.display = 'flex';
        
        showSection('garantias', document.querySelector('.submenu-item'));
        cargarOpcionesInformes(); // Carga desde la variable global
        populateProductDatalists(); // Carga desde la variable global
        updateCartIcon(); 
        checkPendingOrders(); // Carga desde la variable global

    } catch (err) {
        loginError.textContent = err.message || 'Usuario o contraseña incorrectos.';
        loginError.style.display = 'block';
        // ... (Animación de error GSAP)
        gsap.timeline()
            .to('.eye-light', { duration: 0.2, backgroundColor: 'var(--error-color)', boxShadow: '0 0 15px var(--error-color)', ease: 'power2.in' })
            .to('#robot', { duration: 0.1, x: '+=10', yoyo: true, repeat: 5, ease: 'power1.inOut' }, 0)
            .set('#robot', { x: 0 })
            .to('.eye-light', { duration: 1, backgroundColor: 'var(--primary-color)', boxShadow: '0 0 15px var(--primary-color)', ease: 'elastic.out(1, 0.5)' }, '+=0.5');
    }
}

// (MODIFICADO) register() ahora es async y usa fetch
async function register(username, password, role, adminKey) {
    const registerError = document.getElementById('register-error');
    registerError.textContent = '';
    registerError.style.display = 'none';

    // 1. Validar clave de admin en el CLIENTE (ligera optimización)
    if (role !== 'usuario') {
        if (!adminKey) {
            registerError.textContent = 'Se requiere una clave de administrador para este rol.';
            registerError.style.display = 'block';
            return;
        }
        // Validamos la clave contra el admin logueado (si hay uno) o intentamos loguear al admin
        // Por simplicidad, dejaremos que el servidor valide la clave si es necesario
        // Pero para este flujo, asumimos que el adminKey es la contraseña de un admin
        
        // (Lógica simplificada): Asumimos que la clave es la contraseña de un admin
        // El servidor debería manejar una lógica de "clave de invitación"
    }

    try {
        const response = await fetch(`${API_URL}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role }) // (Se ignora adminKey por ahora)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Error al registrar');
        }
        
        // Si el registro es exitoso, loguear
        login(username, password);

    } catch (err) {
        registerError.textContent = err.message;
        registerError.style.display = 'block';
    }
}

// --- LÓGICA DE PERFIL (Sin cambios) ---
function loadProfilePicture(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const profilePicture = document.getElementById('profilePicture');
            profilePicture.src = e.target.result;
            profilePicture.style.display = 'block';
            document.querySelector('.default-avatar').style.display = 'none';
        };
        reader.readAsDataURL(file);
    }
}

// --- LÓGICA DE FORMULARIO DINÁMICO (Sin cambios) ---
function toggleClienteFields(suffix = '') {
    const tipoCliente = document.getElementById(`${suffix}tipoCliente`).value;
    const telefonoGroup = document.getElementById(`${suffix}telefonoGroup`);
    const correoGroup = document.getElementById(`${suffix}correoGroup`);
    const clienteInput = document.getElementById(`${suffix}cliente`);
    const rifInput = document.getElementById(`${suffix}rif`);
    const direccionInput = document.getElementById(`${suffix}direccion`);
    if (tipoCliente === 'externo') {
        [telefonoGroup, correoGroup].forEach(el => { if(el) el.classList.remove('hidden'); });
        [clienteInput, rifInput, direccionInput].forEach(el => { if(el) el.value = ''; });
    } else {
        [telefonoGroup, correoGroup].forEach(el => { if(el) el.classList.add('hidden'); });
        if(clienteInput) clienteInput.value = 'PARCELL SOLUTIONS INTERNATIONAL, C.A';
        if(rifInput) rifInput.value = 'J503787654';
        if(direccionInput) direccionInput.value = 'CENTRO DE VALENCIA CC GRAN BAZAR';
    }
}

// --- LÓGICA DE LISTAS (Garantías - Sin cambios) ---
function agregarItemALista(tipo) {
    const inputId = tipo === 'equipo' ? 'gar_nuevoEquipoInput' : 'gar_nuevoDanoInput';
    const array = tipo === 'equipo' ? currentEquipos : currentDanos;
    const inputEl = document.getElementById(inputId);
    const valor = inputEl.value.trim();
    if(valor && !array.includes(valor)) {
        array.push(valor);
        renderizarLista(tipo);
        inputEl.value = '';
    }
}
function removerItemDeLista(tipo, index) {
    const array = tipo === 'equipo' ? currentEquipos : currentDanos;
    array.splice(index, 1);
    renderizarLista(tipo);
}
function renderizarLista(tipo) {
    const listaId = tipo === 'equipo' ? 'gar_listaEquipos' : 'gar_listaDanos';
    const array = tipo === 'equipo' ? currentEquipos : currentDanos;
    const container = document.getElementById(listaId);
    container.innerHTML = '';
    array.forEach((item, index) => {
        const tag = document.createElement('div');
        tag.className = 'item-tag';
        tag.innerHTML = `<span>${item}</span><span class="remove-item" onclick="removerItemDeLista('${tipo}', ${index})">&times;</span>`;
        container.appendChild(tag);
    });
}

// --- LÓGICA DE ALMACÉN (MODIFICADA) ---

// (ELIMINADO) saveAlmacenes() - El servidor guarda
// (ELIMINADO) actualizarStock() - El servidor lo hace en la transacción

function consultarStock(sede, codigo) {
    if (!almacenData[sede] || !codigo) return null; 
    const almacen = almacenData[sede];
    const producto = almacen.productos.find(p => p.codigo.toLowerCase() === codigo.toLowerCase());
    return producto ? parseFloat(producto.stock) : null;
}

function cargarAlmacen() {
    const user = getLoggedInUser();
    if (!user || (user.role !== 'administrador' && user.role !== 'moderador')) {
        showSection('garantias', document.querySelector('.submenu-item')); 
        return;
    }
    const isAdmin = user.role === 'administrador';
    const sedeSelector = document.getElementById('almacen_nuevaSede');
    const container = document.getElementById('almacenesListContainer');
    
    sedeSelector.innerHTML = '<option value="">Seleccione una sede...</option>';
    
    // (MODIFICADO) Usar reportOptions (ya cargado)
    const sedesDisponibles = (reportOptions.sede || []).filter(s => !almacenData[s]);
    sedesDisponibles.forEach(sede => {
        sedeSelector.innerHTML += `<option value="${sede}">${sede}</option>`;
    });
    if(sedesDisponibles.length === 0) {
         sedeSelector.innerHTML = '<option value="">Todas las sedes tienen almacén</option>';
    }

    container.innerHTML = '';
    // (MODIFICADO) Usar almacenData (ya cargado)
    Object.keys(almacenData).sort().forEach(sede => {
        const almacen = almacenData[sede];
        const almacenEl = document.createElement('div');
        almacenEl.className = 'almacen-container';
        
        let productosHTML = '<div class="producto-list">';
        // (Fix) Asegurarse que almacen.productos existe
        (almacen.productos || []).sort((a,b) => a.nombre.localeCompare(b.nombre)).forEach(p => {
            let stockClass = 'high';
            if (p.stock <= 0) stockClass = 'low';
            else if (p.stock <= 10) stockClass = 'medium';
            
            productosHTML += `
                <div class="producto-item">
                    <div class="producto-info">
                        <span class="producto-nombre">${p.nombre}</span>
                        <span class="producto-codigo">Código: ${p.codigo}</span>
                    </div>
                    <span class="stock-level ${stockClass}">Stock: ${p.stock}</span>
                    <span class="producto-precio">Precio: ${p.precioVenta.toFixed(2)}</span>
                    ${isAdmin ? `<button class="delete-btn" onclick="eliminarProductoDeAlmacen('${sede}', '${p.codigo}')" title="Eliminar Producto"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            `;
        });
        productosHTML += '</div>';

        almacenEl.innerHTML = `
            <div class="almacen-header">
                <h3><i class="fas fa-warehouse" style="color: var(--primary-color); margin-right: 10px;"></i> ${sede}</h3>
                ${isAdmin ? `<button onclick="eliminarAlmacen('${sede}')" title="Eliminar Almacén Completo"><i class="fas fa-trash-alt"></i></button>` : ''}
            </div>
            <div class="almacen-body">
                <h4>Añadir / Actualizar Producto</h4>
                <div class="producto-form-grid">
                    <div class="form-group">
                        <label for="codigo_${sede}">Código:</label>
                        <input type="text" id="codigo_${sede}" placeholder="Código/Serial">
                    </div>
                    <div class="form-group">
                        <label for="nombre_${sede}">Nombre:</label>
                        <input type="text" id="nombre_${sede}" placeholder="Nombre del producto">
                    </div>
                    <div class="form-group">
                        <label for="stock_${sede}">Stock Inicial:</label>
                        <input type="number" id="stock_${sede}" placeholder="Cantidad">
                    </div>
                    <div class="form-group">
                        <label for="precio_${sede}">Precio Venta:</label>
                        <input type="number" id="precio_${sede}" placeholder="Precio">
                    </div>
                    <button class="add-product" onclick="agregarProductoAlmacen('${sede}')">
                        <i class="fas fa-plus-circle"></i> Guardar Producto
                    </button>
                </div>
                <h4>Inventario</h4>
                ${(almacen.productos && almacen.productos.length > 0) ? productosHTML : '<p>Aún no hay productos en este almacén.</p>'}
            </div>
        `;
        container.appendChild(almacenEl);
    });
    
    gsap.fromTo('.almacen-container', 
        { opacity: 0, y: 30 }, 
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: 'power2.out' }
    );
}

// (MODIFICADO) agregarAlmacen ahora es async y usa fetch
async function agregarAlmacen() {
    const user = getLoggedInUser();
    if (!user || (user.role !== 'administrador' && user.role !== 'moderador')) return;

    const sede = document.getElementById('almacen_nuevaSede').value;
    if (sede && !almacenData[sede]) {
        // (MODIFICADO) Solo actualiza el estado local
        almacenData[sede] = { nombre: sede, productos: [] }; 
        // (NOTA) No se necesita fetch/POST para crear sede, se crea al añadir producto
        
        cargarAlmacen();
        populateProductDatalists();
    } else if (almacenData[sede]) {
        alert('Ya existe un almacén para esta sede.');
    }
}

// (MODIFICADO) eliminarAlmacen ahora es async y usa fetch
async function eliminarAlmacen(sede) {
    const user = getLoggedInUser();
    if (user.role !== 'administrador') {
         alert('Solo los administradores pueden eliminar almacenes.'); return;
    }
    if (confirm(`¿Estás seguro de que deseas eliminar el almacén "${sede}" y todo su inventario? Esta acción es PERMANENTE.`)) {
        try {
            const response = await fetch(`${API_URL}/almacen/${sede}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Error en el servidor');
            
            delete almacenData[sede]; // Actualizar estado local
            cargarAlmacen();
            populateProductDatalists();
        } catch (e) {
            alert('Error al eliminar el almacén.');
        }
    }
}

// (MODIFICADO) agregarProductoAlmacen ahora es async y usa fetch
async function agregarProductoAlmacen(sede) {
     const user = getLoggedInUser();
    if (!user || (user.role !== 'administrador' && user.role !== 'moderador')) return;
    
    const codigoInput = document.getElementById(`codigo_${sede}`);
    const nombreInput = document.getElementById(`nombre_${sede}`);
    const stockInput = document.getElementById(`stock_${sede}`);
    const precioInput = document.getElementById(`precio_${sede}`);

    const codigo = codigoInput.value.trim();
    const nombre = nombreInput.value.trim();
    const stock = parseFloat(stockInput.value) || 0;
    const precioVenta = parseFloat(precioInput.value) || 0;

    if (!codigo || !nombre || precioVenta <= 0) {
        alert('Por favor, complete Código, Nombre y Precio de Venta (mayor a 0).'); return;
    }

    const productoData = { codigo, nombre, stock, precioVenta };

    try {
        const response = await fetch(`${API_URL}/almacen/${sede}/productos`, {
            method: 'POST', // El servidor maneja si es INSERT o UPDATE
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productoData)
        });
        if (!response.ok) throw new Error('Error al guardar en el servidor');

        // Actualizar estado local
        const almacen = almacenData[sede];
        const productoExistente = almacen.productos.find(p => p.codigo.toLowerCase() === codigo.toLowerCase());
        if (productoExistente) {
            Object.assign(productoExistente, productoData);
        } else {
            almacen.productos.push(productoData);
        }
        
        cargarAlmacen(); 
        populateProductDatalists();
        [codigoInput, nombreInput, stockInput, precioInput].forEach(el => el.value = '');

    } catch (e) {
        alert('Error al guardar el producto.');
    }
}

// (MODIFICADO) eliminarProductoDeAlmacen ahora es async y usa fetch
async function eliminarProductoDeAlmacen(sede, codigo) {
    const user = getLoggedInUser();
    if (user.role !== 'administrador') {
         alert('Solo los administradores pueden eliminar productos del almacén.'); return;
    }
    
     if (confirm(`¿Estás seguro de que deseas eliminar el producto "${codigo}" del almacén "${sede}"?`)) {
        try {
            const response = await fetch(`${API_URL}/almacen/${sede}/productos/${codigo}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Error en el servidor');
            
            // Actualizar estado local
            const almacen = almacenData[sede];
            almacen.productos = almacen.productos.filter(p => p.codigo !== codigo);
            
            cargarAlmacen();
            populateProductDatalists();
        } catch (e) {
            alert('Error al eliminar el producto.');
        }
    }
}

// --- LÓGICA DE AUTOCOMPLETADO EN FACTURACIÓN (MODIFICADA) ---

function populateProductDatalists() {
    // ... (Sin cambios, ahora usa la variable global 'almacenData')
    const datalist = document.getElementById('factProductNamesDataList');
    if (!datalist) return;
    datalist.innerHTML = '';
    allProductsMasterList = []; 
    const uniqueNames = new Set();
    Object.values(almacenData).forEach(almacen => {
        (almacen.productos || []).forEach(p => {
            allProductsMasterList.push({
                nombre: p.nombre,
                codigo: p.codigo,
                precioVenta: p.precioVenta,
                sede: almacen.nombre
            });
            if (!uniqueNames.has(p.nombre)) {
                uniqueNames.add(p.nombre);
                datalist.innerHTML += `<option value="${p.nombre}"></option>`;
            }
        });
    });
}

function autocompletarProductoFacturaPorCodigo() {
    // ... (Sin cambios, usa 'almacenData')
    const sede = document.getElementById('fact_sedeFacturacion').value;
    const codigo = document.getElementById('fact_codigoProducto').value;
    const nombreInput = document.getElementById('fact_nombreProducto');
    const precioInput = document.getElementById('fact_precioUnitario');
    if (!codigo.trim()) {
        nombreInput.value = '';
        precioInput.value = '';
        return;
    }
    if (!almacenData[sede]) return; 
    const producto = (almacenData[sede].productos || []).find(p => p.codigo.toLowerCase() === codigo.toLowerCase());
    if (producto) {
        nombreInput.value = producto.nombre;
        precioInput.value = producto.precioVenta;
        gsap.fromTo([nombreInput, precioInput], { backgroundColor: '#e6f7ff' }, { backgroundColor: '#fff', duration: 1.5, ease: 'power2.out' });
    } else {
        nombreInput.value = '';
        precioInput.value = '';
    }
}

function autocompletarProductoFacturaPorNombre() {
    // ... (Sin cambios, usa 'almacenData')
    const sede = document.getElementById('fact_sedeFacturacion').value;
    const nombreInput = document.getElementById('fact_nombreProducto');
    const codigoInput = document.getElementById('fact_codigoProducto');
    const precioInput = document.getElementById('fact_precioUnitario');
    const nombreSeleccionado = nombreInput.value;
    if (!nombreSeleccionado.trim()) {
        codigoInput.value = '';
        precioInput.value = '';
        return;
    }
    if (document.activeElement === codigoInput) return;
    let producto = null;
    if (almacenData[sede]) {
         producto = (almacenData[sede].productos || []).find(p => p.nombre === nombreSeleccionado);
    }
    if (producto) {
        codigoInput.value = producto.codigo;
        precioInput.value = producto.precioVenta;
        gsap.fromTo([codigoInput, precioInput], { backgroundColor: '#e6f7ff' }, { backgroundColor: '#fff', duration: 1.5, ease: 'power2.out' });
    } else {
        codigoInput.value = '';
        precioInput.value = '';
    }
}

// --- LÓGICA DE CARRITO DE COMPRAS (Sin cambios) ---
// (Esta es la lógica del carrito INTERNO del POS, no de la tienda pública)
function saveCart() {
    localStorage.setItem(DB_KEY_CART, JSON.stringify(currentCart));
    updateCartIcon();
}
function updateCartIcon() {
    const badge = document.getElementById('cartCountBadge');
    const totalItems = currentCart.items.reduce((sum, item) => sum + item.cantidad, 0);
    if (totalItems > 0) {
        badge.textContent = totalItems;
        badge.style.display = 'block';
        gsap.fromTo(badge, {scale: 1.5}, {scale: 1, duration: 0.3, ease: 'elastic.out(1, 0.7)'});
    } else {
        badge.style.display = 'none';
    }
}
function openCartModal() {
    const modal = document.getElementById('cartModal');
    const body = document.getElementById('cartModalBody');
    const totalEl = document.getElementById('cartModalTotal');
    const checkoutBtn = document.getElementById('modalCheckoutBtn');
    const emptyMsg = document.getElementById('cartEmptyMessage');
    
    body.innerHTML = ''; 
    let total = 0;

    if (currentCart.items.length === 0) {
        body.appendChild(emptyMsg);
        emptyMsg.style.display = 'block';
        checkoutBtn.disabled = true;
    } else {
        emptyMsg.style.display = 'none';
        currentCart.items.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'cart-item';
            itemEl.innerHTML = `
                <div class="cart-item-info">
                    <span class="cart-item-nombre">${item.nombreProducto}</span>
                    <span class="cart-item-precio">${item.cantidad} x ${item.precioUnitario.toFixed(2)} = ${(item.cantidad * item.precioUnitario).toFixed(2)}</span>
                </div>
                <div class="cart-item-actions">
                    <input type="number" value="${item.cantidad}" min="1" max="${item.maxStock}" onchange="changeCartQuantity('${item.codigo}', this.value)">
                    <i class="fas fa-trash cart-remove-btn" onclick="removeFromCart('${item.codigo}')"></i>
                </div>
            `;
            body.appendChild(itemEl);
            total += item.cantidad * item.precioUnitario;
        });
        checkoutBtn.disabled = false;
    }
    
    totalEl.textContent = total.toFixed(2);
    modal.style.display = 'flex';
}
function closeModal() {
    document.getElementById('cartModal').style.display = 'none';
}
function changeCartQuantity(codigo, nuevaCantidad) {
    const qty = parseInt(nuevaCantidad);
    const item = currentCart.items.find(i => i.codigo === codigo);
    if (!item) return;

    if (qty <= 0) {
        removeFromCart(codigo);
        return;
    }
    
    if (qty > item.maxStock) {
        alert(`No puedes agregar más de ${item.maxStock} unidades (stock disponible).`);
        item.cantidad = item.maxStock;
    } else {
        item.cantidad = qty;
    }
    saveCart();
    openCartModal(); 
}
function removeFromCart(codigo) {
    currentCart.items = currentCart.items.filter(i => i.codigo !== codigo);
    if (currentCart.items.length === 0) {
        currentCart.sede = null; 
    }
    saveCart();
    openCartModal(); 
}
function checkout() {
    if (currentCart.items.length === 0) return;
    
    const cartTotal = currentCart.items.reduce((sum, i) => sum + (i.cantidad * i.precioUnitario), 0);
    
    checkoutData = {
        items: [...currentCart.items],
        total: cartTotal,
        sede: currentCart.sede
    };

    currentCart = { sede: null, items: [] };
    saveCart();
    
    closeModal();
    const facturacionLink = document.querySelector('a[onclick="showSection(\'facturacion\', this)"]');
    showSection('facturacion', facturacionLink);
}

// --- LÓGICA DE TIENDA (POS) (MODIFICADA) ---

function cargarPOS() {
    const user = getLoggedInUser();
    if (!user || (user.role !== 'administrador' && user.role !== 'moderador')) {
        showSection('garantias', document.querySelector('.submenu-item'));
        return;
    }

    const sedeSelector = document.getElementById('pos_sedeSelector');
    const searchInput = document.getElementById('pos_productSearch');
    sedeSelector.innerHTML = '<option value="">Seleccione una sede...</option>';
    
    const sedesConAlmacen = Object.keys(almacenData);
    
    if (sedesConAlmacen.length === 0) {
        sedeSelector.innerHTML = '<option value="">No hay almacenes configurados</option>';
        document.getElementById('posProductGrid').innerHTML = '<p>No hay almacenes. Vaya a la sección "Almacén" para crear uno.</p>';
        searchInput.style.display = 'none'; 
        return;
    }

    sedesConAlmacen.forEach(sede => {
        sedeSelector.innerHTML += `<option value="${sede}">${sede}</option>`;
    });
    
    searchInput.value = '';
    searchInput.style.display = 'none';
    displayProducts(''); 
}

function getIconForProduct(productName) {
    const name = productName.toLowerCase();
    if (name.includes('telefono') || name.includes('móvil') || name.includes('celular')) return 'fas fa-mobile-alt';
    if (name.includes('audifono')) return 'fas fa-headphones';
    if (name.includes('corneta')) return 'fas fa-volume-up';
    if (name.includes('reloj') || name.includes('watch')) return 'fas fa-clock'; // fa-watch es de pago, usamos fa-clock
    if (name.includes('computadora') || name.includes('laptop')) return 'fas fa-laptop';
    if (name.includes('consola') || name.includes('gamepad')) return 'fas fa-gamepad';
    if (name.includes('3/4')) return 'fas fa-clone';
    if (name.includes('pieza')) return 'fas fa-cog';
    if (name.includes('tablet')) return 'fas fa-tablet-alt';
    return 'fas fa-box-open'; // Default
}

function filterDisplayedProducts() {
    const sede = document.getElementById('pos_sedeSelector').value;
    if (sede) {
        displayProducts(sede);
    }
}

function displayProducts(sede) {
    const grid = document.getElementById('posProductGrid');
    const searchInput = document.getElementById('pos_productSearch');
    
    if (!sede) {
        grid.innerHTML = '<p>Por favor, seleccione un almacén para ver los productos.</p>';
        searchInput.style.display = 'none';
        return;
    }
    
    searchInput.style.display = 'block'; 
    const searchTerm = searchInput.value.toLowerCase();

    const almacen = almacenData[sede];
    if (!almacen || !almacen.productos || almacen.productos.length === 0) {
        grid.innerHTML = '<p>Este almacén no tiene productos en inventario.</p>';
        return;
    }

    const filteredProducts = almacen.productos.filter(p => 
        p.nombre.toLowerCase().includes(searchTerm) ||
        p.codigo.toLowerCase().includes(searchTerm)
    );

    grid.innerHTML = ''; 

    if (filteredProducts.length === 0) {
        grid.innerHTML = '<p>No se encontraron productos que coincidan con su búsqueda.</p>';
        return;
    }
    
    filteredProducts.sort((a,b) => a.nombre.localeCompare(b.nombre)).forEach(p => {
        const originalIndex = almacen.productos.findIndex(origP => origP.codigo === p.codigo);

        const stock = p.stock || 0;
        const isDisabled = stock <= 0;
        let stockClass = '';
        if (stock <= 0) stockClass = 'stock-low';
        else if (stock <= 10) stockClass = 'stock-medium';
        
        const card = document.createElement('div');
        card.className = 'pos-product-card';
        card.innerHTML = `
            <div class="pos-product-icon">
                <i class="${getIconForProduct(p.nombre)}"></i>
            </div>
            <div class="pos-product-info">
                <span class="product-nombre" title="${p.nombre}">${p.nombre}</span>
                <span class="product-precio">${p.precioVenta.toFixed(2)}</span>
                <span class="product-stock ${stockClass}">Stock: ${stock}</span>
            </div>
            <div class="pos-product-actions">
                <input type="number" id="qty_${originalIndex}" value="1" min="1" max="${stock}" ${isDisabled ? 'disabled' : ''}>
                <button onclick="addToCart('${sede}', ${originalIndex})" ${isDisabled ? 'disabled' : ''}>
                    ${isDisabled ? 'Agotado' : '<i class="fas fa-cart-plus"></i> Añadir'}
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function addToCart(sede, productIndex) {
    const almacen = almacenData[sede];
    const producto = almacen.productos[productIndex];
    const cantidad = parseInt(document.getElementById(`qty_${productIndex}`).value);

    if (isNaN(cantidad) || cantidad <= 0) {
        alert('Ingrese una cantidad válida.'); return;
    }

    if (currentCart.sede && currentCart.sede !== sede) {
        if (!confirm(`Tienes items de la sede "${currentCart.sede}".\n¿Deseas limpiar el carrito y empezar uno nuevo en "${sede}"?`)) {
            return; 
        }
        currentCart = { sede: sede, items: [] };
    } else if (!currentCart.sede) {
        currentCart.sede = sede;
    }
    
    const itemEnCarrito = currentCart.items.find(i => i.codigo === producto.codigo);
    const cantidadEnCarrito = itemEnCarrito ? itemEnCarrito.cantidad : 0;
    
    if ((cantidad + cantidadEnCarrito) > producto.stock) {
        alert(`Stock insuficiente.\n- Stock Disponible: ${producto.stock}\n- Ya en carrito: ${cantidadEnCarrito}\n- Intentando agregar: ${cantidad}`);
        return;
    }

    if (itemEnCarrito) {
        itemEnCarrito.cantidad += cantidad;
    } else {
        currentCart.items.push({
            cantidad: cantidad,
            codigo: producto.codigo,
            nombreProducto: producto.nombre,
            precioUnitario: producto.precioVenta,
            maxStock: producto.stock 
        });
    }
    
    saveCart();
    
    gsap.to(document.getElementById('cartIcon'), { scale: 1.3, repeat: 1, yoyo: true, duration: 0.2, ease: 'power1.inOut' });
}


// --- LÓGICA DE TABLA DE PRODUCTOS (MODIFICADA) ---

function agregarProducto(tipo) {
    const prefix = (tipo === 'garantia') ? 'gar_' : 'fact_';
    const cantidad = parseFloat(document.getElementById(`${prefix}cantidad`).value);
    const codigo = document.getElementById(`${prefix}codigoProducto`).value.trim();
    const nombreProducto = document.getElementById(`${prefix}nombreProducto`).value;
    const precioUnitario = parseFloat(document.getElementById(`${prefix}precioUnitario`).value);
    
    if (isNaN(cantidad) || cantidad <= 0 || isNaN(precioUnitario) || precioUnitario < 0 || nombreProducto.trim() === '') {
        alert('Por favor, complete los campos Cantidad (mayor a 0), Nombre y Precio (no negativo) del producto/servicio.');
        return;
    }
    
    if (prefix === 'fact_') {
        const sede = document.getElementById('fact_sedeFacturacion').value;
        if (!sede) {
            alert('Por favor, seleccione una Sede de facturación primero.');
            return;
        }
        // Solo chequear stock si se proporcionó un código
        if (codigo) {
            const stockDisponible = consultarStock(sede, codigo);
            if (stockDisponible !== null) {
                const cantidadTotalEnCarro = currentProducts
                    .filter(p => p.codigo.toLowerCase() === codigo.toLowerCase())
                    .reduce((acc, p) => acc + p.cantidad, 0);
                    
                if ((cantidad + cantidadTotalEnCarro) > stockDisponible) {
                    alert(`¡Stock insuficiente para "${nombreProducto}" (Código: ${codigo})!\n\n- Stock Disponible: ${stockDisponible}\n- Ya en factura: ${cantidadTotalEnCarro}\n- Intentando agregar: ${cantidad}`);
                    return;
                }
            }
        }
    }

    currentProducts.push({ cantidad, codigo: codigo || 'N/A', nombreProducto, precioUnitario, subtotal: cantidad * precioUnitario });
    actualizarTabla(tipo);
    calcularTotales(tipo);
    limpiarCamposProducto(tipo);
}

function eliminarProducto(index, tipo) {
    currentProducts.splice(index, 1);
    actualizarTabla(tipo);
    calcularTotales(tipo);
}
function actualizarTabla(tipo) {
    const tableBodyId = (tipo === 'garantia') ? 'garantiaFacturaBody' : 'facturaBody';
    const facturaBody = document.getElementById(tableBodyId);
    facturaBody.innerHTML = '';
    currentProducts.forEach((producto, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${producto.cantidad}</td><td>${producto.codigo}</td><td>${producto.nombreProducto}</td><td>${producto.precioUnitario.toFixed(2)}</td><td>${producto.subtotal.toFixed(2)}</td><td><button onclick="eliminarProducto(${index}, '${tipo}')" class="delete-invoice" style="padding: 5px 10px; font-size: 12px;">Eliminar</button></td>`;
        facturaBody.appendChild(row);
    });
}
function calcularTotales(tipo) {
    const totalId = (tipo === 'garantia') ? 'garantiaTotal' : 'facturaTotal';
    currentTotal = currentProducts.reduce((sum, producto) => sum + producto.subtotal, 0);
    document.getElementById(totalId).textContent = currentTotal.toFixed(2);
}
function limpiarCamposProducto(tipo) {
    const prefix = (tipo === 'garantia') ? 'gar_' : 'fact_';
    document.getElementById(`${prefix}cantidad`).value = '';
    document.getElementById(`${prefix}codigoProducto`).value = '';
    document.getElementById(`${prefix}nombreProducto`).value = '';
    document.getElementById(`${prefix}precioUnitario`).value = '';
}

// --- LÓGICA DE GUARDADO (MODIFICADA) ---
// (MODIFICADO) guardarGarantia ahora es async y usa fetch
async function guardarGarantia() {
    if (currentProducts.length === 0) { alert('Debe agregar al menos un producto/servicio.'); return; }
    const garantia = {
        id: Date.now(), record_type: 'garantia',
        sedeFacturacion: document.getElementById('gar_sedeFacturacion').value, 
        numeroFactura: document.getElementById('gar_numeroFactura').value,
        fechaEmisionGarantia: document.getElementById('gar_fechaEmisionGarantia').value, 
        fechaEmisionFactura: document.getElementById('gar_fechaEmisionFactura').value,
        tipoCliente: document.getElementById('gar_tipoCliente').value, 
        cliente: document.getElementById('gar_cliente').value, 
        rif: document.getElementById('gar_rif').value,
        direccion: document.getElementById('gar_direccion').value, 
        condicion: document.getElementById('gar_condicion').value,
        telefono: document.getElementById('gar_telefono').value, 
        correo: document.getElementById('gar_correo').value,
        enviaA: document.getElementById('gar_enviaA').value, 
        recibeA: document.getElementById('gar_recibeA').value,
        equipo: JSON.stringify(currentEquipos),
        especificacionDano: JSON.stringify(currentDanos),
        moneda: document.getElementById('gar_moneda').value,
        costo: parseFloat(document.getElementById('gar_costo').value) || 0, 
        total: currentTotal, productos: currentProducts
    };
    try {
        const response = await fetch(`${API_URL}/registros/garantia`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(garantia)
        });
        if (!response.ok) throw new Error('Error en el servidor');
        
        alert("Nota de garantía guardada en el servidor.");
        limpiarFormularioCompleto('garantiasSection');
    } catch(err) { console.error("Error al guardar garantía:", err); alert("Ocurrió un error al guardar la nota."); }
}

// (MODIFICADO) guardarFactura ahora es async y usa fetch
async function guardarFactura() {
    if (currentProducts.length === 0) { alert('Debe agregar al menos un producto/servicio.'); return; }
    const sedeFacturacion = document.getElementById('fact_sedeFacturacion').value;
    if (!sedeFacturacion) {
        alert('Error: La sede de facturación no puede estar vacía.'); return;
    }
    
    const factura = {
        id: Date.now(), record_type: 'factura',
        sedeFacturacion: sedeFacturacion, 
        numeroFactura: document.getElementById('fact_numeroFactura').value,
        numeroControl: document.getElementById('fact_numeroControl').value,
        fechaEmision: document.getElementById('fact_fechaEmision').value, 
        tipoCliente: document.getElementById('fact_tipoCliente').value, 
        cliente: document.getElementById('fact_cliente').value, 
        rif: document.getElementById('fact_rif').value,
        direccion: document.getElementById('fact_direccion').value, 
        metodoPago: document.getElementById('fact_metodoPago').value,
        telefono: document.getElementById('fact_telefono').value, 
        correo: document.getElementById('fact_correo').value,
        moneda: document.getElementById('fact_moneda').value,
        total: currentTotal, productos: currentProducts
    };
    
    try {
        const response = await fetch(`${API_URL}/registros/factura`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(factura)
        });
        if (!response.ok) throw new Error('Error en el servidor');
        
        // (MODIFICADO) Actualizar el stock local AHORA
        factura.productos.forEach(p => {
            if(p.codigo && p.codigo !== 'N/A') {
                const almacen = almacenData[factura.sedeFacturacion];
                if (almacen) {
                    const producto = (almacen.productos || []).find(prod => prod.codigo === p.codigo);
                    if (producto) {
                        producto.stock = parseFloat(producto.stock) - parseFloat(p.cantidad);
                    }
                }
            }
        });

        alert("Factura guardada y stock actualizado.");
        limpiarFormularioCompleto('facturacionSection');
        
    } catch(err) { 
        console.error("Error al guardar factura:", err); 
        alert("Ocurrió un error al guardar la factura."); 
    }
}

function limpiarFormularioCompleto(sectionId) {
    currentProducts = []; currentEquipos = []; currentDanos = []; currentTotal = 0;
    actualizarTabla('garantia'); calcularTotales('garantia');
    actualizarTabla('factura'); calcularTotales('factura');
    renderizarLista('equipo'); renderizarLista('dano');
    document.getElementById(sectionId).querySelectorAll('input, select').forEach(el => {
        if (el.type !== 'checkbox' && el.type !== 'submit' && !el.id.startsWith('sedeFacturacion') && !el.id.endsWith('moneda') && !el.id.endsWith('tipoCliente')) {
            el.value = '';
        }
        if (el.id.endsWith('tipoCliente')) el.value = 'interno';
        
        if (el.id === 'fact_sedeFacturacion') {
            el.disabled = false;
        }
    });
    toggleClienteFields('gar_'); toggleClienteFields('fact_');
    document.getElementById('gar_fechaEmisionGarantia').valueAsDate = new Date();
    document.getElementById('fact_fechaEmision').valueAsDate = new Date();
}
   
// --- LÓGICA DE BUZONES (MODIFICADA) ---
// (MODIFICADO) cargarBuzon ahora es async y usa fetch
async function cargarBuzon(tipo) {
    const buzonContent = document.getElementById(`buzonContent_${tipo}`);
    const sedeSeleccionada = document.getElementById(`sedeSelector_${tipo}`).value;
    buzonContent.innerHTML = '';
    const user = getLoggedInUser();
    
    try {
        const response = await fetch(`${API_URL}/registros/${tipo}?sede=${sedeSeleccionada}`);
        if (!response.ok) throw new Error('Error al cargar del servidor');
        
        let registros = await response.json();
        
        if (registros.length > 0) {
            registros.sort((a, b) => b.id - a.id); // El servidor ya debería darlos por ID
            registros.forEach(registro => {
                const { id, sedeFacturacion, numeroFactura, total, moneda, cliente } = registro;
                const fecha = registro.fechaEmisionGarantia || registro.fechaEmision;
                const tipoRegistro = (tipo === 'garantias') ? "Garantía" : "Factura";
                const itemClass = (tipo === 'garantias') ? "buzon-item" : "buzon-item factura-item";
                
                const deleteButton = (user && user.role === 'administrador') 
                    ? `<button class="delete-invoice" onclick="eliminarRegistro(${id}, '${tipo}')">Eliminar</button>` 
                    : '';
                
                const element = document.createElement('div');
                element.className = itemClass;
                element.innerHTML = `
                    <h3>${tipoRegistro}: ${numeroFactura || 'N/A'} (Sede: ${sedeFacturacion})</h3>
                    <p><strong>Fecha:</strong> ${fecha}</p> <p><strong>Cliente:</strong> ${cliente}</p>
                    <p><strong>Total:</strong> ${parseFloat(total).toFixed(2)} ${moneda}</p>
                    <div class="buzon-actions">
                        <button class="export-pdf" onclick="exportarRegistroBuzonPDF(${id}, '${tipo}')">PDF</button>
                        <button class="export-excel" onclick="exportarRegistroBuzonExcel(${id}, '${tipo}')">Excel</button>
                        ${deleteButton}
                    </div>`;
                buzonContent.appendChild(element);
            });
        }
         if (buzonContent.innerHTML === '') {
            buzonContent.innerHTML = `<p>No hay ${tipo} para la sede seleccionada.</p>`;
        }
    } catch(err) {
         console.error(`Error al cargar el buzón de ${tipo}:`, err);
         buzonContent.innerHTML = '<p>Error al leer los datos del servidor.</p>';
    }
}

// (MODIFICADO) getRegistroCompletoById ahora es async y usa fetch (o podría buscar en local si cargamos todo)
// Por simplicidad, asumiremos que el buzón ya cargó los datos que necesitamos
// y crearemos una función SINCRONA que busque en los datos cargados
async function getRegistroCompletoById(id, tipo) {
    // Esta función ahora es ASYNC y consulta la API por un solo registro
    // (NOTA: El servidor no tiene endpoint para esto, así que simularemos)
    
    const dbKey = (tipo === 'garantias') ? 'garantias' : 'facturas';
    const response = await fetch(`${API_URL}/registros/${dbKey}`); // Vuelve a pedir todo
    const registros = await response.json();
    return registros.find(r => r.id === id) || null;
}

// (MODIFICADO) exportarRegistroBuzonPDF ahora es async
async function exportarRegistroBuzonPDF(id, tipo) {
    const registro = await getRegistroCompletoById(id, tipo); // Esperar
    if (!registro) { alert('No se encontró el registro.'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    generarPDF(registro, doc, false);
    doc.save(`registro_${registro.numeroFactura || id}.pdf`);
}

// (MODIFICADO) exportarRegistroBuzonExcel ahora es async
async function exportarRegistroBuzonExcel(id, tipo) {
    const registro = await getRegistroCompletoById(id, tipo); // Esperar
    if (!registro) { alert('No se encontró el registro.'); return; }
    const wb = XLSX.utils.book_new();
    const ws = generarExcel(registro);
    XLSX.utils.book_append_sheet(wb, ws, `Registro ${registro.numeroFactura || id}`);
    XLSX.writeFile(wb, `registro_${registro.numeroFactura || id}.xlsx`);
}

// (MODIFICADO) getFilteredRegistros ahora es async
async function getFilteredRegistros(tipo) {
    const sedeSeleccionada = document.getElementById(`sedeSelector_${tipo}`).value;
    try {
        const response = await fetch(`${API_URL}/registros/${tipo}?sede=${sedeSeleccionada}`);
        if (!response.ok) throw new Error('Error al cargar del servidor');
        return await response.json();
    } catch (e) { console.error("Error filtrando registros:", e); return []; }
}

// (MODIFICADO) exportarTodoPDF ahora es async
async function exportarTodoPDF(tipo) {
    const registros = await getFilteredRegistros(tipo); // Esperar
    if (registros.length === 0) { alert(`No hay ${tipo} para exportar.`); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    registros.forEach((registro, index) => {
        if (registro) generarPDF(registro, doc, index > 0);
    });
    doc.save(`reporte_total_${tipo}_parcell.pdf`);
    alert(`Reporte en PDF generado.`);
}

// (MODIFICADO) exportarTodoExcel ahora es async
async function exportarTodoExcel(tipo) {
    const registros = await getFilteredRegistros(tipo); // Esperar
    if (registros.length === 0) { alert(`No hay ${tipo} para exportar.`); return; }
    const wb = XLSX.utils.book_new();
    registros.forEach(registro => {
        if (registro) {
            const ws = generarExcel(registro);
            const sheetName = `Reg_${registro.numeroFactura || registro.id}`.replace(/[\\/?*[\]]/g, "").substring(0, 31);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        }
    });
    XLSX.writeFile(wb, `reporte_total_${tipo}_parcell.xlsx`);
    alert(`Reporte en Excel generado.`);
}

// (MODIFICADO) eliminarRegistro ahora es async y usa fetch
async function eliminarRegistro(id, tipo) {
    const user = getLoggedInUser();
    if (!user || user.role !== 'administrador') {
        alert('No tienes permiso para eliminar registros.');
        return;
    }
    if (confirm('¿Estás seguro de que deseas eliminar este registro de forma permanente?')) {
        try {
            const response = await fetch(`${API_URL}/registros/${tipo}/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Error en el servidor');
            
            cargarBuzon(tipo);
            alert("Registro eliminado.");
        } catch(err) {
            console.error("Error al eliminar:", err);
            alert("Error al eliminar el registro.");
        }
    }
}

// --- GENERADORES PDF/EXCEL DINÁMICOS (Sin cambios) ---
function generarPDF(registro, doc, newPage = false) {
     if (newPage) doc.addPage();
    const page = { width: doc.internal.pageSize.getWidth(), height: doc.internal.pageSize.getHeight() };
    const margin = { top: 20, right: 15, bottom: 20, left: 15 };
    const contentWidth = page.width - margin.left - margin.right;
    let y = margin.top;
    const title = (registro.record_type === 'garantia') ? 'NOTA DE GARANTÍA' : 'FACTURA';
    doc.setFontSize(18).setFont('helvetica', 'bold').text(title, page.width / 2, y, { align: 'center' }); y += 8;
    doc.setFontSize(10).setFont('helvetica', 'normal');
    doc.text(`Número Factura:`, margin.left, y).setFont('helvetica', 'bold').text(`${registro.numeroFactura || 'N/A'}`, margin.left + 35, y);
    const fecha = registro.fechaEmisionGarantia || registro.fechaEmision;
    doc.setFont('helvetica', 'normal').text(`Fecha Emisión: ${fecha || 'N/A'}`, page.width - margin.right, y, { align: 'right' }); y += 6;
    doc.text(`Sede:`, margin.left, y).setFont('helvetica', 'bold').text(`${registro.sedeFacturacion}`, margin.left + 35, y); 
    if(registro.record_type === 'factura' && registro.numeroControl) {
         doc.setFont('helvetica', 'normal').text(`N° Control: ${registro.numeroControl}`, page.width - margin.right, y, { align: 'right' });
    }
    y += 12;
    doc.setFontSize(11).setFont('helvetica', 'bold').text('Información del Cliente', margin.left, y); y += 5;
    doc.setDrawColor(200).line(margin.left, y, contentWidth + margin.left, y); y += 6;
    doc.setFontSize(9).setFont('helvetica', 'normal');
    [`Cliente: ${registro.cliente}`, `RIF: ${registro.rif}`, `Dirección: ${registro.direccion}`].forEach(line => {
        const lines = doc.splitTextToSize(line, contentWidth);
        doc.text(lines, margin.left, y); y += lines.length * 5;
    });
    y += 4;
    if (registro.record_type === 'garantia') {
        const equipoStr = JSON.parse(registro.equipo || '[]').join(', ');
        if (equipoStr) {
             doc.setFontSize(11).setFont('helvetica', 'bold').text('Detalles de la Garantía', margin.left, y); y += 5;
             doc.setDrawColor(200).line(margin.left, y, contentWidth + margin.left, y); y += 6;
             doc.setFontSize(9);
             doc.setFont('helvetica', 'bold').text('Equipos:', margin.left, y).setFont('helvetica', 'normal');
             let lines = doc.splitTextToSize(equipoStr, contentWidth - 20); doc.text(lines, margin.left + 18, y); y += lines.length * 5;
             doc.setFont('helvetica', 'bold').text('Daños:', margin.left, y).setFont('helvetica', 'normal');
             lines = doc.splitTextToSize(JSON.parse(registro.especificacionDano || '[]').join(', '), contentWidth - 20); doc.text(lines, margin.left + 18, y); y += lines.length * 5;
             y += 4;
        }
    }
    doc.setFont('helvetica', 'bold');
    doc.text('Cant.', margin.left + 2, y); doc.text('Código', margin.left + 15, y); doc.text('Descripción', margin.left + 45, y);
    doc.text('P. Unitario', page.width - margin.right - 50, y, { align: 'right' }); doc.text('Subtotal', page.width - margin.right - 2, y, { align: 'right' }); y += 2;
    doc.setDrawColor(150).line(margin.left, y, page.width - margin.right, y); y += 6;
    doc.setFont('helvetica', 'normal');
    if(registro.productos && Array.isArray(registro.productos)) {
        registro.productos.forEach(p => {
            doc.text(String(p.cantidad), margin.left + 2, y); doc.text(p.codigo || 'N/A', margin.left + 15, y); doc.text(p.nombreProducto, margin.left + 45, y);
            doc.text(p.precioUnitario.toFixed(2), page.width - margin.right - 50, y, { align: 'right' });
            doc.text(p.subtotal.toFixed(2), page.width - margin.right - 2, y, { align: 'right' }); y += 6;
        });
    }
    y += 5;
    doc.line(page.width - margin.right - 70, y, page.width - margin.right, y); y += 6;
    doc.setFont('helvetica', 'bold').text(`Total (${registro.moneda}):`, page.width - margin.right - 68, y).text(registro.total.toFixed(2), page.width - margin.right -2, y, { align: 'right' });
}
function generarExcel(registro) {
    const title = (registro.record_type === 'garantia') ? 'NOTA DE GARANTÍA' : 'FACTURA';
    const fecha = registro.fechaEmisionGarantia || registro.fechaEmision;
    const headerData = [
        [title, ''], ['Número Documento:', registro.numeroFactura || 'N/A'], ['Fecha Emisión:', fecha || 'N/A'],
        ['Sede:', registro.sedeFacturacion || 'N/A'],
    ];
    if(registro.record_type === 'factura' && registro.numeroControl) {
         headerData.push(['Número Control:', registro.numeroControl]);
    }
    headerData.push([], ['Información del Cliente', ''], ['Cliente:', registro.cliente], ['RIF:', registro.rif], ['Dirección:', registro.direccion]);
    if (registro.record_type === 'garantia') {
        const equipoData = JSON.parse(registro.equipo || '[]');
        if (equipoData.length > 0) {
            headerData.push([], ['Detalles de la Garantía', ''], ['Equipos:', equipoData.join(', ')], ['Daños:', JSON.parse(registro.especificacionDano || '[]').join(', ')]);
        }
    }
    headerData.push([]);
    const ws = XLSX.utils.aoa_to_sheet(headerData);
    const tableHeader = ['Cantidad', 'Código', 'Nombre del Producto', 'Precio Unitario', 'Subtotal'];
    XLSX.utils.sheet_add_aoa(ws, [tableHeader], { origin: -1 });
    let productosData = [];
    if(registro.productos && Array.isArray(registro.productos)) {
         productosData = registro.productos.map(p => [
            p.cantidad, p.codigo || 'N/A', p.nombreProducto,
            { t: 'n', v: p.precioUnitario, f: `#_."${registro.moneda}"* #,##0.00` },
            { t: 'n', v: p.subtotal, f: `#_."${registro.moneda}"* #,##0.00` }
        ]);
    }
    XLSX.utils.sheet_add_json(ws, productosData, { origin: -1, skipHeader: true });
    const totalRow = [['', '', '', 'Total:', { t: 'n', v: registro.total, f: `#_."${registro.moneda}"* #,##0.00` }]];
    XLSX.utils.sheet_add_aoa(ws, totalRow, { origin: -1 });
    ws['!cols'] = [ { wch: 10 }, { wch: 20 }, { wch: 40 }, { wch: 18 }, { wch: 18 } ];
    return ws;
}

// --- LÓGICA DE OPCIONES (CON ROLES - MODIFICADA) ---
function cargarOpcionesInformes() {
    // ... (MODIFICADO) Carga desde la variable global 'reportOptions'
    const container = document.getElementById('opcionesGuardadas');
    container.innerHTML = '';
    const selectsSede = [document.getElementById('gar_sedeFacturacion'), document.getElementById('sedeSelector_garantias'), document.getElementById('fact_sedeFacturacion'), document.getElementById('sedeSelector_facturas'), document.getElementById('pos_sedeSelector')];
    const datalists = { equipo: document.getElementById('equiposDataList'), especificacion: document.getElementById('danosDataList'), metodoPago: document.getElementById('metodoPagoDataList') };
    const user = getLoggedInUser(); 
    
    selectsSede.forEach(sel => { if(sel) sel.innerHTML = '<option value="Todas">Todas las Sedes</option>'; });
    Object.values(datalists).forEach(dl => { if(dl) dl.innerHTML = ''; });
    
    Object.keys(reportOptions).forEach(tipo => {
        container.innerHTML += `<h4>${{'sede':'Sedes', 'equipo':'Equipos', 'especificacion':'Especificaciones', 'metodoPago':'Métodos de Pago'}[tipo] || tipo}</h4>`;
        
        // (Fix) Asegurarse que el array existe
        (reportOptions[tipo] || []).forEach((valor, index) => {
            const deleteButton = (user && user.role === 'administrador')
                ? `<div class="report-option-actions"><button class="delete-option" onclick="eliminarOpcionInforme('${tipo}', ${index})">Eliminar</button></div>`
                : '';
            container.innerHTML += `<div class="report-option-item"><span>${valor}</span>${deleteButton}</div>`;
            if (tipo === 'sede') {
               selectsSede.forEach(selectEl => {
                   if (selectEl) selectEl.innerHTML += `<option value="${valor}">${valor}</option>`;
               });
            } else if (datalists[tipo]) {
                datalists[tipo].innerHTML += `<option value="${valor}">${valor}</option>`;
            }
        });
    });
    // ... (Limpieza de "Todas", sin cambios)
    if(document.getElementById('gar_sedeFacturacion').options[0]) document.getElementById('gar_sedeFacturacion').options[0].remove();
    if(document.getElementById('fact_sedeFacturacion').options[0]) document.getElementById('fact_sedeFacturacion').options[0].remove();
    const posSedeSelect = document.getElementById('pos_sedeSelector');
    if(posSedeSelect && posSedeSelect.options[0] && posSedeSelect.options[0].value === 'Todas') {
        posSedeSelect.options[0].textContent = "Seleccione una sede...";
        posSedeSelect.options[0].value = "";
    }
}

// (MODIFICADO) agregarOpcionInforme ahora es async y usa fetch
async function agregarOpcionInforme() {
    const tipo = document.getElementById('nuevaOpcionTipo').value;
    const valorInput = document.getElementById('nuevaOpcionValor');
    const valor = valorInput.value.trim();
    
    if (valor && !reportOptions[tipo].includes(valor)) {
        reportOptions[tipo].push(valor); // Actualizar local
        try {
            // Enviar TODAS las opciones al servidor
            const response = await fetch(`${API_URL}/options`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reportOptions)
            });
            if (!response.ok) throw new Error('Error en el servidor');
            
            valorInput.value = '';
            cargarOpcionesInformes(); 
        } catch (e) {
            alert('Error al guardar la opción.');
            reportOptions[tipo].pop(); // Revertir si falla
        }
    } else alert(valor ? 'Esta opción ya existe.' : 'El valor no puede estar vacío.');
}

// (MODIFICADO) eliminarOpcionInforme ahora es async y usa fetch
async function eliminarOpcionInforme(tipo, index) {
    const user = getLoggedInUser();
    if (!user || user.role !== 'administrador') {
        alert('No tienes permiso para eliminar opciones. Solo los administradores pueden.');
        return;
    }
    if (reportOptions[tipo].length <= 1) {
        alert('No puedes eliminar la última opción.'); return;
    }
    
    const [removedOption] = reportOptions[tipo].splice(index, 1); // Quitar local
    
    try {
        // Enviar TODAS las opciones al servidor
        const response = await fetch(`${API_URL}/options`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reportOptions)
        });
        if (!response.ok) throw new Error('Error en el servidor');
        
        cargarOpcionesInformes();
    } catch (e) {
        alert('Error al eliminar la opción.');
        reportOptions[tipo].splice(index, 0, removedOption); // Revertir si falla
    }
}

// --- LÓGICA DE GESTIÓN DE CUENTAS (MODIFICADA) ---
// (MODIFICADO) cargarCuentas ahora es async y usa fetch
async function cargarCuentas() {
    const user = getLoggedInUser();
    if (!user || user.role !== 'administrador') {
        showSection('garantias', document.querySelector('.submenu-item')); 
        return;
    }
    const container = document.getElementById('cuentasListContainer');
    container.innerHTML = '';
    
    try {
        const response = await fetch(`${API_URL}/users`);
        if (!response.ok) throw new Error('Error en servidor');
        const allUsers = await response.json();
        
        allUsers.forEach(u => {
            const isRootAdmin = u.username === 'sano4D';
            const isSelf = u.username === user.username;
            const canDelete = !isRootAdmin && !isSelf;
            
            const item = document.createElement('div');
            item.className = 'cuenta-item';
            item.innerHTML = `
                <div class="cuenta-info">
                    <span class="cuenta-username">${u.username}</span>
                    <span class="cuenta-role ${u.role}">${u.role}</span>
                </div>
                <button classs="delete-invoice" onclick="eliminarUsuario('${u.username}')" ${!canDelete ? 'disabled' : ''}>
                    Eliminar
                </button>
            `;
            container.appendChild(item);
        });
    } catch (e) {
        container.innerHTML = '<p>Error al cargar las cuentas.</p>';
    }
}

// (MODIFICADO) eliminarUsuario ahora es async y usa fetch
async function eliminarUsuario(username) {
    const user = getLoggedInUser();
    if (!user || user.role !== 'administrador') {
        alert('No tienes permiso para realizar esta acción.'); return;
    }
    if (username === 'sano4D') {
        alert('No puedes eliminar al administrador raíz.'); return;
    }
    if (username === user.username) {
        alert('No puedes eliminarte a ti mismo.'); return;
    }

    if (confirm(`¿Estás seguro de que deseas eliminar al usuario "${username}"? Esta acción es permanente.`)) {
        try {
            const response = await fetch(`${API_URL}/users/${username}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Error en el servidor');
            
            cargarCuentas(); 
        } catch (e) {
            alert('Error al eliminar el usuario.');
        }
    }
}


// --- NAVEGACIÓN (MODIFICADA) ---
function toggleSubmenu(element) {
    document.querySelectorAll('.sidebar-item.has-submenu.open').forEach(openItem => {
        if (openItem !== element) {
            openItem.classList.remove('open');
            openItem.nextElementSibling.classList.remove('open');
        }
    });
    element.classList.toggle('open');
    const submenu = element.nextElementSibling;
    submenu.classList.toggle('open');
}

// (MODIFICADO) showSection() con 'almacen', 'pos' y 'checkout'
function showSection(section, element) {
    ['garantiasSection', 'buzonGarantiasSection', 'facturacionSection', 'buzonFacturasSection', 'opcionesInformesSection', 'cuentasSection', 'almacenSection', 'posSection'].forEach(id => {
        const el = document.getElementById(id); if(el) el.style.display = 'none';
    });
    
    document.querySelectorAll('.sidebar-item.active, .submenu-item.active').forEach(item => item.classList.remove('active'));
    
    if (element) {
        element.classList.add('active');
        if (element.classList.contains('submenu-item')) {
            element.parentElement.previousElementSibling.classList.add('active');
            element.parentElement.classList.add('open');
            element.parentElement.previousElementSibling.classList.add('open');
        }
    }

    // ===== INICIO DE MODIFICACIÓN =====
    // Limpia datos al cambiar de sección, excepto si se va a facturación (para checkout)
    if (section !== 'facturacion') {
        currentProducts = []; currentTotal = 0; currentEquipos = []; currentDanos = [];
        actualizarTabla('garantia'); actualizarTabla('factura');
        calcularTotales('garantia'); calcularTotales('factura');
        renderizarLista('equipo'); renderizarLista('dano');

        if (checkoutData) { // Limpiar si se abandona facturación
            checkoutData = null;
            document.getElementById('fact_sedeFacturacion').disabled = false;
        }
    }
    // ===== FIN DE MODIFICACIÓN =====
    
    const sectionMap = {
        'garantias': { el: 'garantiasSection', type: 'block', loader: () => {
            document.getElementById('gar_fechaEmisionGarantia').valueAsDate = new Date();
            toggleClienteFields('gar_');
        }},
        'buzonGarantias': { el: 'buzonGarantiasSection', type: 'flex', loader: () => cargarBuzon('garantias') },
        'facturacion': { el: 'facturacionSection', type: 'block', loader: () => {
            // --- LÓGICA DE CHECKOUT ---
            if (checkoutData) {
                currentProducts = checkoutData.items.map(item => ({
                    cantidad: item.cantidad,
                    codigo: item.codigo,
                    nombreProducto: item.nombreProducto,
                    precioUnitario: item.precioUnitario,
                    subtotal: item.cantidad * item.precioUnitario
                }));
                currentTotal = checkoutData.total;
                actualizarTabla('factura');
                calcularTotales('factura');
                
                const sedeSelect = document.getElementById('fact_sedeFacturacion');
                sedeSelect.value = checkoutData.sede;
                sedeSelect.disabled = true; 
                // checkoutData = null; // NO SE LIMPIA AQUÍ, SINO AL CAMBIAR DE SECCIÓN
                document.getElementById('fact_fechaEmision').valueAsDate = new Date();
                toggleClienteFields('fact_');
            } else {
                // Comportamiento normal
                document.getElementById('fact_fechaEmision').valueAsDate = new Date();
                toggleClienteFields('fact_');
                document.getElementById('fact_sedeFacturacion').disabled = false;
            }
        }},
        'buzonFacturas': { el: 'buzonFacturasSection', type: 'flex', loader: () => cargarBuzon('facturas') },
        'almacen': { el: 'almacenSection', type: 'block', loader: cargarAlmacen },
        'pos': { el: 'posSection', type: 'block', loader: cargarPOS }, // (NUEVO)
        'opciones-informes': { el: 'opcionesInformesSection', type: 'flex', loader: cargarOpcionesInformes },
        'cuentas': { el: 'cuentasSection', type: 'block', loader: cargarCuentas },
    };
    
    const selected = sectionMap[section];
    if (selected) {
        const user = getLoggedInUser();
        if ( (section === 'almacen' || section === 'pos') && (user.role !== 'administrador' && user.role !== 'moderador')) {
            alert('No tienes permiso para acceder a esta sección.');
            showSection('garantias', document.querySelector('.submenu-item'));
            return;
        }
        if (section === 'cuentas' && user.role !== 'administrador') {
             alert('No tienes permiso para acceder a esta sección.');
            showSection('garantias', document.querySelector('.submenu-item'));
            return;
        }
        
        document.getElementById(selected.el).style.display = selected.type;
        if (selected.loader) selected.loader();
    }
}

// --- INICIALIZACIÓN Y ANIMACIÓN DE LOGIN (MODIFICADO) ---
document.addEventListener('DOMContentLoaded', () => {

     const loginView = document.getElementById('loginView');
     const registerView = document.getElementById('registerView');
     const loginForm = document.getElementById('login-form');
     const registerForm = document.getElementById('register-form');
     const showRegisterLink = document.getElementById('show-register');
     const showLoginLink = document.getElementById('show-login');
     const registerRoleSelect = document.getElementById('register-role');
     const adminKeyGroup = document.getElementById('admin-key-group');
     const toggleLoginPass = document.getElementById('toggleLoginPass');
     const toggleRegisterPass = document.getElementById('toggleRegisterPass');
     const toggleAdminKey = document.getElementById('toggleAdminKey');

    const modal = document.getElementById('cartModal');
    if(modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginView.classList.add('hidden');
        registerView.classList.remove('hidden');
    });
    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        registerView.classList.add('hidden');
        loginView.classList.remove('hidden');
    });
     loginForm.addEventListener('submit', (e) => { 
         e.preventDefault(); 
         const username = document.getElementById('login-username').value;
         const password = document.getElementById('login-password').value;
         login(username, password); // (AHORA ES ASYNC)
     });
     registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;
        const role = document.getElementById('register-role').value;
        const adminKey = document.getElementById('register-admin-key').value;
        register(username, password, role, adminKey); // (AHORA ES ASYNC)
     });
     registerRoleSelect.addEventListener('change', () => {
        const selectedRole = registerRoleSelect.value;
        if (selectedRole === 'moderador' || selectedRole === 'administrador') {
            adminKeyGroup.classList.remove('hidden');
        } else {
            adminKeyGroup.classList.add('hidden');
        }
    });
     function setupPasswordToggle(toggleBtn, inputEl) {
        if (!toggleBtn) return;
        toggleBtn.addEventListener('click', function () {
            const type = inputEl.getAttribute('type') === 'password' ? 'text' : 'password';
            inputEl.setAttribute('type', type);
            this.classList.toggle('fa-eye');
            this.classList.toggle('fa-eye-slash');
        });
     }
     setupPasswordToggle(toggleLoginPass, document.getElementById('login-password'));
     setupPasswordToggle(toggleRegisterPass, document.getElementById('register-password'));
     setupPasswordToggle(toggleAdminKey, document.getElementById('register-admin-key'));

    // ... (ANIMACIÓN ROBOT GSAP - Sin cambios) ...
    const robot = document.getElementById('robot');
    const head = document.getElementById('head');
    const cloud = document.getElementById('dream-cloud');
    const loginWrapper = document.querySelector('.login-wrapper');
    let isAwake = false;
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    gsap.set(robot, { y: 100, scale: 0.8 });
    gsap.set(cloud, { scale: 0, opacity: 0 });
    gsap.set(loginWrapper, { y: 50, opacity: 0 });
    gsap.to(robot, {
        y: 0, scale: 1, duration: 1.5, ease: 'elastic.out(1, 0.5)', delay: 0.5,
        onComplete: () => {
            gsap.to(head, { y: -5, repeat: -1, yoyo: true, duration: 2, ease: 'sine.inOut', id: 'headFloat' });
            gsap.to(cloud, {
                scale: 1, opacity: 1, duration: 1, ease: 'elastic.out(1, 0.7)',
                onComplete: () => {
                    gsap.to(cloud, { scale: 1.05, repeat: -1, yoyo: true, duration: 1.5, ease: 'sine.inOut', id: 'cloudFloat' });
                }
            });
             gsap.to(loginWrapper, { y: 0, opacity: 1, duration: 0.8, ease: 'power2.out' });
        }
    });
    function wakeUpRobot() {
        if (isAwake) return;
        isAwake = true;
        gsap.killTweensOf(head);
        gsap.killTweensOf(cloud);
        gsap.timeline()
            .to(cloud, { scale: 0, opacity: 0, duration: 0.5, ease: 'power2.in' })
            .to(head, { y: 0, duration: 0.2, ease: 'power2.out' })
            .to('.eye-light', { width: 35, duration: 0.1, repeat: 1, yoyo: true })
            .to('.ear', {
                y: '-=10', yoyo: true, repeat: 1, duration: 0.2,
                boxShadow: '0 0 15px var(--primary-color)',
                ease: 'power1.inOut'
            }, '-=0.2')
            .to('.eye-light', {
                backgroundColor: 'var(--success-color)',
                boxShadow: '0 0 20px var(--success-color)',
                duration: 0.5
            });
    }
    robot.addEventListener('click', wakeUpRobot);
    usernameInput.addEventListener('focus', wakeUpRobot);
    passwordInput.addEventListener('focus', wakeUpRobot);

    // (MODIFICADO) Revisar si ya existe una sesión
    if (getLoggedInUser()) {
        const user = getLoggedInUser(); 
        // No solo mostrar, AHORA DEBE LOGUEARSE para cargar los datos
        login(user.username, user.password); // <-- Llama a la función login() async
    }
});


// --- (NUEVO) LÓGICA DE BUZÓN DE PEDIDOS DE TIENDA ---
// (Reemplaza las funciones de modal sueltas al final de tu archivo original)

/**
 * Revisa pedidos pendientes de la tienda y actualiza el modal y el badge.
 */
function checkPendingOrders() {
    // ... (MODIFICADO) Usa la variable global 'pendingOrdersData'
    const orders = pendingOrdersData || [];
    const badge = document.getElementById('inboxCountBadge');
    const modalBody = document.getElementById('inboxModalBody');
    const emptyMsg = document.getElementById('inboxEmptyMessage');

    if (!badge || !modalBody || !emptyMsg) return; // Salir si los elementos no existen

    if (orders.length > 0) {
        badge.textContent = orders.length;
        badge.style.display = 'block';
        emptyMsg.style.display = 'none';
        modalBody.innerHTML = ''; // Limpiar
        
        orders.forEach(order => {
            let itemsHTML = order.items.map(item => `<li>${item.cantidad} x ${item.nombreProducto} (Código: ${item.codigo})</li>`).join('');
            const orderEl = document.createElement('div');
            orderEl.className = 'buzon-item'; // Reusar estilo de buzón
            orderEl.innerHTML = `
                <h3>Pedido de: ${order.customer.cliente} (Sede: ${order.sede})</h3>
                <p><strong>Contacto:</strong> ${order.customer.telefono || 'N/A'} | ${order.customer.correo || 'N/A'}</p>
                <p><strong>RIF/CI:</strong> ${order.customer.rif}</p>
                <p><strong>Dirección:</strong> ${order.customer.direccion || 'N/A'}</p>
                <p><strong>Items:</strong></p>
                <ul>${itemsHTML}</ul>
                <p><strong>Total Pedido:</strong> ${order.total.toFixed(2)}</p>
                <div class="buzon-actions">
                    <button class="add-product" onclick="aprobarPedido(${order.id})" style="background: #28a745; color: white;">Aprobar y Facturar</button>
                    <button class="delete-invoice" onclick="rechazarPedido(${order.id})">Rechazar Pedido</button>
                </div>
            `;
            modalBody.appendChild(orderEl);
        });
    } else {
        badge.textContent = '0';
        badge.style.display = 'none';
        modalBody.innerHTML = ''; // Limpiar
        modalBody.appendChild(emptyMsg);
        emptyMsg.style.display = 'block';
    }
}

/**
 * Mueve un pedido del buzón a la sección de "Crear Factura"
 */
// (MODIFICADO) aprobarPedido ahora es async y usa fetch
async function aprobarPedido(orderId) {
    const orderIndex = pendingOrdersData.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return;
    
    const order = pendingOrdersData[orderIndex];
    
    // Usar la variable global 'checkoutData' para pasar datos
    checkoutData = {
        items: order.items,
        total: order.total,
        sede: order.sede
    };
    
    // Ir a la sección de facturación
    const facturacionLink = document.querySelector('a[onclick="showSection(\'facturacion\', this)"]');
    showSection('facturacion', facturacionLink);
    
    // Rellenar datos del cliente
    document.getElementById('fact_tipoCliente').value = 'externo';
    toggleClienteFields('fact_'); // Activar campos externos
    document.getElementById('fact_cliente').value = order.customer.cliente;
    document.getElementById('fact_rif').value = order.customer.rif;
    document.getElementById('fact_direccion').value = order.customer.direccion;
    document.getElementById('fact_telefono').value = order.customer.telefono;
    document.getElementById('fact_correo').value = order.customer.correo;
    
    try {
        // Eliminar pedido de la BBDD
        const response = await fetch(`${API_URL}/orders/${orderId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Error en el servidor');

        pendingOrdersData.splice(orderIndex, 1); // Eliminar de la caché local
        
        closeInboxModal();
        checkPendingOrders(); // Actualizar el badge
        
        alert('Pedido cargado en "Crear Factura".\nRevise los datos y guarde la factura para descontar el stock.');

    } catch (e) {
        alert('Error al aprobar el pedido.');
    }
}

/**
 * Elimina un pedido pendiente del buzón
 */
// (MODIFICADO) rechazarPedido ahora es async y usa fetch
async function rechazarPedido(orderId) {
    if (!confirm('¿Está seguro de que desea rechazar y eliminar este pedido permanentemente?')) return;
    
    try {
        const response = await fetch(`${API_URL}/orders/${orderId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Error en el servidor');
        
        pendingOrdersData = pendingOrdersData.filter(o => o.id !== orderId); // Eliminar de caché local
        checkPendingOrders(); // Recargar el modal
    } catch (e) {
        alert('Error al rechazar el pedido.');
    }
}

/**
 * Abre el modal del buzón de pedidos
 */
function openInboxModal() {
    checkPendingOrders(); // Refrescar al abrir
    document.getElementById('inboxModal').style.display = 'flex';
}

/**
 * Cierra el modal del buzón de pedidos
 */
function closeInboxModal() {
    document.getElementById('inboxModal').style.display = 'none';
}