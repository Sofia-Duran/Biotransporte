const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const xlsx = require('xlsx');
const bcrypt = require('bcrypt');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const app = express();
const PDFDocument = require('pdfkit');
const fs = require('fs');
require('dotenv').config();

// Configuración de la sesión
app.use(session({
    secret: 'secretKey',
    resave: false,
    saveUninitialized: false,
}));
  
app.use(bodyParser.urlencoded({ extended: true }));
  
  
function requireRole(role) {
    return (req, res, next) => {
        if (req.session.user && req.session.user.tipo_usuario === role) {
            next();
        } else {
            res.status(403).send('<h1>Acceso denegado</h1>');
        }
    };
}

function requireLogin(req, res, next) {
    if (!req.session.user) {
      return res.redirect('/login.html');
    }
    next();
}
  
// Ruta para la página principal
app.get('/',requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Configuración de Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Registro de usuario
app.post('/registro', (req, res) => {
    const { username, password, codigo_acceso } = req.body;
  
    const query = 'SELECT tipo_usuario FROM codigos_acceso WHERE codigo = ?';
    connection.query(query, [codigo_acceso], (err, results) => {
        if (err || results.length === 0) {
            return res.send(`<link rel="stylesheet" href="/styles.css"> 
                             <h2>Código de acceso inválido</h2>
                             <button onclick="window.location.href='/registro.html'">Volver</button>`);
        }
        const tipo_user = results[0].tipo_usuario;
        const hashedPassword = bcrypt.hashSync(password, 10);
        const insertUser = 'INSERT INTO usuarios (nombre_usuario, password_hash, tipo_usuario) VALUES (?, ?, ?)';
        connection.query(insertUser, [username, hashedPassword, tipo_user], (err) => {
            if (err) {
              return res.send(`<link rel="stylesheet" href="/styles.css">
                               <h1>Error al registrar usuario</h1>
                               <button onclick="window.location.href='/registro.html'">Volver</button>`);
            }
            return res.send(`
                            <link rel="stylesheet" href="/styles.css">
                            <h2>Usuario ${username} guardado en la base de datos.</h2>
                            <button onclick="window.location.href='/login.html'">Volver</button>`);
          });
    });
});

// Iniciar sesión
app.post('/login', (req, res) => {
    const { nombre_usuario, password } = req.body;
  
    // Consulta para obtener el usuario y su tipo
    const query = 'SELECT * FROM usuarios WHERE nombre_usuario = ?';
    connection.query(query, [nombre_usuario], (err, results) => {
        if (err) {
            return res.send(`<link rel="stylesheet" href="/styles.css"> 
                             <h2>Error al obtener el usuario</h2>
                             <button onclick="window.location.href='/login.html'">Volver</button>`);
        }
  
        if (results.length === 0) {
            return res.send(`<link rel="stylesheet" href="/styles.css"> 
                             <h2>Usuario no encontrado</h2>
                             <button onclick="window.location.href='/login.html'">Volver</button>`);
        }
  
        const user = results[0];
  
        // Verificar la contraseña
        const isPasswordValid = bcrypt.compareSync(password, user.password_hash);
        if (!isPasswordValid) {
            return res.send(`<link rel="stylesheet" href="/styles.css"> 
                             <h2>Contraseña incorrecta</h2>
                             <button onclick="window.location.href='/login.html'">Volver</button>`);
        }
  
        // Almacenar la información del usuario en la sesión
        req.session.user = {
            id: user.id,
            nombre_usuario: user.nombre_usuario,
            tipo_usuario: user.tipo_usuario // Aquí se establece el tipo de usuario en la sesión
        };
  
        // Redirigir al usuario a la página principal
        res.redirect('/');
    });
});

// Configuración de la base de datos
const connection = mysql.createConnection({
    host: process.env.DB_HOST,       // Host desde .env
    user: process.env.DB_USER,       // Usuario desde .env
    password: process.env.DB_PASSWORD,   // Contraseña desde .env
    database: process.env.DB_NAME    // Nombre de la base de datos desde .env
  });

connection.connect(err => {
  if (err) throw err;
  console.log('Conectado a la base de datos');
});

// Ruta para obtener el tipo de usuario actual
app.get('/tipo-usuario', requireLogin, (req, res) => {
    res.json({ tipo_usuario: req.session.user.tipo_usuario });
});
  
// Cerrar sesión
app.get('/logout',requireLogin, (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// Ruta para que solo admin pueda ver todos los usuarios
app.get('/ver-usuarios', requireLogin, requireRole('logistico'), (req, res) => {
    const query = 'SELECT * FROM usuarios';
    connection.query(query, (err, results) => {
        if (err) {
          return res.send(`<link rel="stylesheet" href="/styles.css"> 
                           <h2>Error al obtener usuarios</h2>
                           <button onclick="window.location.href='/index.html'">Volver</button>`);
        }
        let html = `
          <html>
          <head>
            <link rel="stylesheet" href="/styles.css">
            <title>Usuarios Registrados</title>
          </head>
          <body>
            <h1 class="anim-down">Usuarios Registrados</h1>
            <table class="anim-up">
              <thead>
                <tr>
                  <th>Nombre de usuario</th>
                  <th>Tipo de usuario</th>
                </tr>
              </thead>
              <tbody>
        `;
  
        results.forEach(user => {
          html += `
            <tr>
              <td>${user.nombre_usuario}</td>
              <td>${user.tipo_usuario}</td>
            </tr>
          `;
        });
  
        html += `
              </tbody>
            </table>
            <button onclick="window.location.href='/'">Volver</button>
          </body>
          </html>
        `;
        res.send(html);
    });
});

//Ruta para editar las características de las tablas de la base de datos
app.post('/editar-tabla', requireLogin, requireRole('logistico'), (req, res) => {
  const { nombre_tabla, nombre_columna, tipo_dato} = req.body;
  connection.query(`ALTER TABLE ${nombre_tabla} ADD COLUMN ${nombre_columna} ${tipo_dato}`, (err, result) => {
    if(err){
      console.error(err);
      return res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Error al editar la tabla en la base de datos.</h1>
                       <button onclick="window.location.href='/editar-tabla.html'">Volver</button>`);
    }
    res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Columna ${nombre_columna} agregada correctamente.</h1>
                       <button onclick="window.location.href='/editar-tabla.html'">Volver</button>`);
  });
});

//Ruta para eliminar columnas de las tablas de la base de datos
app.post('/eliminar-columna', requireLogin, requireRole('logistico'), (req, res) => {
  const { nombre_tabla, nombre_columna} = req.body;
  connection.query(`ALTER TABLE ${nombre_tabla} DROP COLUMN ${nombre_columna}`, (err, result) => {
    if(err){
      console.error(err);
      return res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Error al eliminar la columna la tabla ${nombre_tabla} en la base de datos.</h1>
                       <button onclick="window.location.href='/editar-tabla.html'">Volver</button>`);
    }
    res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Columna ${nombre_columna} eliminada de la tabla ${nombre_tabla} correctamente.</h1>
                       <button onclick="window.location.href='/editar-tabla.html'">Volver</button>`);
  });
});

const upload = multer({ dest: 'uploads/' });
app.post('/upload-hospital', upload.single('excelFile'), requireLogin, (req, res) => {
    const filePath = req.file.path;
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
  
    data.forEach(row => {
      const { nombre, direccion, correo, telefono} = row;
      const sql = `INSERT INTO hospitales (nombre_hospital, direccion, correo, telefono) VALUES (?, ?, ?, ?)`;
      connection.query(sql, [nombre, direccion, correo, telefono], err => {
        if (err) throw err;
      });
    });
  
    res.send(`<link rel="stylesheet" href="/styles.css"> 
              <h2>Archivo cargado y datos guardados</h2>
              <button onclick="window.location.href='/hospitales.html'">Volver</button>`);
});
  
app.get('/download-hospital', requireLogin, requireRole('logistico'), (req, res) => {
  const sql = `SELECT * FROM hospitales`;
  connection.query(sql, (err, results) => {
    if (err) throw err;  
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="hospitales.pdf"');
    const doc = new PDFDocument();
    doc.pipe(res);
    doc.text('Lista de hospitales', { align: 'center', underline: true });
    doc.moveDown(2);
    results.forEach((row) => {
      doc.text(`Nombre: ${row.nombre_hospital}`);
      doc.text(`Dirección: ${row.direccion}`);
      doc.text(`Fecha de envio: ${row.fecha_envio}`);
      doc.text(`Correo: ${row.correo}`);
      doc.text(`Teléfono: ${row.telefono}`);
      doc.moveDown(1);
    });
    doc.end();
  });
});

app.post('/upload-transport', upload.single('excelFile'),requireLogin, (req, res) => {
    const filePath = req.file.path;
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
  
    data.forEach(row => {
      const { nombre, telefono, fecha_contratacion, salario} = row;
      const sql = `INSERT INTO transportistas (nombre, telefono, fecha_contratacion, salario) VALUES (?, ?, ?, ?)`;
      connection.query(sql, [nombre, telefono, fecha_contratacion, salario], err => {
        if (err) throw err;
      });
    });
  
    res.send(`<link rel="stylesheet" href="/styles.css"> 
              <h1>Archivo cargado y datos guardados</h1>
              <button onclick="window.location.href='/transportistas.html'">Volver</button>`);
});
  
app.get('/download-transport', requireLogin, requireRole('logistico'), (req, res) => {
  const sql = `SELECT * FROM transportistas`;
  connection.query(sql, (err, results) => {
    if (err) throw err;  
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="transportistas.pdf"');
    const doc = new PDFDocument();
    doc.pipe(res);
    doc.text('Lista de transportistas', { align: 'center', underline: true });
    doc.moveDown(2);
    results.forEach((row) => {
      doc.text(`ID: ${row.id}`);
      doc.text(`Nombre: ${row.nombre}`);
      doc.text(`Teléfono: ${row.telefono}`);
      doc.text(`Fecha de contratación: ${row.fecha_contratacion}`);
      doc.moveDown(1);
    });
    doc.end();
  });
});

// Ruta para guardar hospitales en la base de datos
app.post('/insertar-hospital',requireLogin,requireRole('logistico'), (req, res) => {
    const { nombre, direccion, correo, tel } = req.body;
  
    const query = 'INSERT INTO hospitales (nombre_hospital, direccion, correo, telefono) VALUES (?, ?, ?, ?)';
    connection.query(query, [nombre, direccion, correo, tel], (err, result) => {
      if (err) {
        return res.send(`<link rel="stylesheet" href="/styles.css">
                        <h2>Error al guardar los datos en la base de datos.</h2>
                         <button onclick="window.location.href='/hospitales.html'">Volver</button>`);
      }
      res.send(`<link rel="stylesheet" href="/styles.css">
                <h2>Hospital ${nombre} guardado en la base de datos.</h2>
                <button onclick="window.location.href='/hospitales.html'">Volver</button>`);
    });
});

// Ruta para buscar hospitales
app.get('/buscar-hospitales',requireLogin, (req, res) => {
    const query = req.query.query;
    const sql = `SELECT nombre_hospital, direccion, telefono FROM hospitales WHERE nombre_hospital LIKE ?`;
    connection.query(sql, [`%${query}%`], (err, results) => {
      if (err) throw err;
      res.json(results);
    });
  });

// Ruta para mostrar los hospitales de la base de datos en formato HTML
app.get('/ver-hospitales',requireLogin, requireRole('logistico'), (req, res) => {
    connection.query('SELECT * FROM hospitales', (err, results) => {
      if (err) {
        return res.send(`<link rel="stylesheet" href="/styles.css">
                          <h2>Error al obtener los datos.</h2>
                         <button onclick="window.location.href='/index.html'">Volver</button>`);
      }
  
      let html = `
        <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <title>Hospitales</title>
        </head>
        <body>
          <h1>Hospitales Registrados</h1>
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>ID</th>
                <th>Dirección</th>
                <th>Correo</th>
                <th>Teléfono</th>
              </tr>
            </thead>
            <tbody>
      `;
  
      results.forEach(hospital => {
        html += `
          <tr>
            <td>${hospital.nombre_hospital}</td>
            <td>${hospital.id}</td>
            <td>${hospital.direccion}</td>
            <td>${hospital.correo}</td>
            <td>${hospital.telefono}</td>
          </tr>
        `;
      });
  
      html += `
            </tbody>
          </table>
          <button onclick="window.location.href='/'">Volver</button>
        </body>
        </html>
      `;
  
      res.send(html);
    });
});

//Ruta para editar los hospitales en la base de datos
app.post('/editar-hospital', requireLogin, requireRole('logistico'), (req, res) => {
  const { nombre, direccion, correo, telefono, id} = req.body;
  const query = 'UPDATE hospitales SET nombre_hospital = ?, direccion = ?, correo = ?, telefono = ? WHERE id = ?';
  connection.query(query, [nombre, direccion, correo, telefono, id], (err, result) => {
    if(err){
      console.error(err);
      return res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Error al editar el hospital en la base de datos.</h1>
                       <button onclick="window.location.href='/editar.html'">Volver</button>`);
    }
    res.redirect('/ver-hospitales');
  });
});

//Ruta para eliminar hospitales en la base de datos
app.post('/eliminar-hospital',requireLogin,requireRole('logistico'), (req, res) => {
  const { nombre, id } = req.body;
  const query = 'DELETE FROM hospitales WHERE nombre_hospital = ? AND id = ?';
  connection.query(query, [nombre, id], (err, result) => {
    if (err) {
      return res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Error al eliminar los datos en la base de datos.</h1>
                       <button onclick="window.location.href='/eliminar.html'">Volver</button>`);
    }
    res.send(`<link rel="stylesheet" href="/styles.css">
              <h1>Hospital ${nombre} eliminado en la base de datos.</h1>
              <button onclick="window.location.href='/eliminar.html'">Volver</button>`);
  });
});

//Ruta para iniciar transaccion para eliminar en la base de datos
app.get('/transaccion-eliminar',requireLogin, (req, res) => {
  const query = 'START TRANSACTION';
  connection.query(query, (err, result) => {
    if (err) {
      return res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Error al realizar la transacción en la base de datos.</h1>
                       <button onclick="window.location.href='/eliminar.html'">Volver</button>`);
    }
  });
  res.redirect('/eliminar.html');
});

//Ruta para no guardar cambios en la base de datos
app.get('/rollback',requireLogin, (req, res) => {
  const query = 'ROLLBACK';
  connection.query(query, (err, result) => {
    if (err) {
      return res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Error al realizar rollback en la base de datos.</h1>
                       <button onclick="window.location.href='/eliminar.html'">Volver</button>`);
    }
  });
  res.redirect('/eliminar.html');
});

//Ruta para guardar cambios en la base de datos
app.get('/commit',requireLogin, (req, res) => {
  const query = 'COMMIT';
  connection.query(query, (err, result) => {
    if (err) {
      return res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Error al realizar commit en la base de datos.</h1>
                       <button onclick="window.location.href='/eliminar.html'">Volver</button>`);
    }
  });
  res.redirect('/eliminar.html');
});

// Ruta para guardar transportistas en la base de datos
app.post('/insertar-transportista',requireLogin,requireRole('logistico'), (req, res) => {
    const { nombre, telefono, fecha_contratacion, salario } = req.body;
  
    const query = 'INSERT INTO transportistas (nombre, telefono, fecha_contratacion, salario) VALUES (?, ?, ?, ?)';
    connection.query(query, [nombre, telefono, fecha_contratacion, salario], (err, result) => {
      if (err) {
        return res.send(`<link rel="stylesheet" href="/styles.css">
                         <h1>Error al guardar los datos en la base de datos.</h1>
                         <button onclick="window.location.href='/transportistas.html'">Volver</button>`);
      }
      res.send(`<link rel="stylesheet" href="/styles.css">
                <h1>Transportista ${nombre} guardado en la base de datos.</h1>
                <button onclick="window.location.href='/transportistas.html'">Volver</button>`);
    });
});

// Ruta para mostrar los transportistas de la base de datos en formato HTML
app.get('/ver-transportistas',requireLogin, requireRole('logistico'), (req, res) => {
    connection.query('SELECT * FROM transportistas', (err, results) => {
      if (err) {
        return res.send(`<link rel="stylesheet" href="/styles.css">
                         <h1>Error al obtener los datos.</h1>`);
      }
  
      let html = `
        <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <title>Transportistas</title>
        </head>
        <body>
          <h1>Transportistas Registrados</h1>
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>ID</th>
                <th>Teléfono</th>
                <th>Fecha de contratación</th>
                <th>Salario</th>
              </tr>
            </thead>
            <tbody>
      `;
  
      results.forEach(transportista => {
        html += `
          <tr>
            <td>${transportista.nombre}</td>
            <td>${transportista.id}</td>
            <td>${transportista.telefono}</td>
            <td>${transportista.fecha_contratacion}</td>
            <td>${transportista.salario}</td>
          </tr>
        `;
      });
  
      html += `
            </tbody>
          </table>
          <button onclick="window.location.href='/'">Volver</button>
        </body>
        </html>
      `;
  
      res.send(html);
    });
});

// Ruta para mostrar los transportistas destacados de la base de datos en formato HTML
app.get('/ver-transportistas-destacados',requireLogin, requireRole('logistico'), (req, res) => {
    connection.query('SELECT nombre, fecha_contratacion, telefono FROM transportistas WHERE salario > (SELECT AVG(salario) FROM transportistas)', (err, results) => {
      if (err) {
        return res.send(`<link rel="stylesheet" href="/styles.css">
                         <h1>Error al obtener los datos.</h1>`);
      }
  
      let html = `
        <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <title>Transportistas destacados</title>
        </head>
        <body>
          <h1>Transportistas que exceden el salario promedio</h1>
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Fecha de contratación</th>
              </tr>
            </thead>
            <tbody>
      `;
  
      results.forEach(transportista => {
        html += `
          <tr>
            <td>${transportista.nombre}</td>
            <td>${transportista.telefono}</td>
            <td>${transportista.fecha_contratacion}</td>
          </tr>
        `;
      });
  
      html += `
            </tbody>
          </table>
          <button onclick="window.location.href='/'">Volver</button>
        </body>
        </html>
      `;
  
      res.send(html);
    });
});

// Ruta para buscar transportistas
app.get('/buscar-transportistas',requireLogin, (req, res) => {
  const query = req.query.query;
  const sql = `SELECT nombre, telefono FROM transportistas WHERE nombre LIKE ?`;
  connection.query(sql, [`%${query}%`], (err, results) => {
    if (err) throw err;
    res.json(results);
  });
});

//Ruta para editar los transportistas en la base de datos
app.post('/editar-transportista', requireLogin, requireRole('logistico'), (req, res) => {
  const { nombre, telefono, fecha_contratacion, salario, id} = req.body;
  const query = 'UPDATE transportistas SET nombre = ?, telefono = ?, fecha_contratacion = ?, salario = ? WHERE id = ?';
  connection.query(query, [nombre, telefono, fecha_contratacion, salario, id], (err, result) => {
    if(err){
      console.error(err);
      return res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Error al editar el transportista en la base de datos.</h1>
                       <button onclick="window.location.href='/editar.html'">Volver</button>`);
    }
    res.redirect('/ver-transportistas');
  });
});

//Ruta para eliminar transportistas en la base de datos
app.post('/eliminar-transportista',requireLogin,requireRole('logistico'), (req, res) => {
  const { nombre, id } = req.body;
  const query = 'DELETE FROM transportistas WHERE nombre = ? AND id = ?';
  connection.query(query, [nombre, id], (err, result) => {
    if (err) {
      return res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Error al eliminar los datos en la base de datos.</h1>`);
    }
    res.send(`<link rel="stylesheet" href="/styles.css">
              <h1>Transportista ${nombre} eliminado en la base de datos.</h1>`);
  });
});

// Ruta para guardar envíos en la base de datos
app.post('/insertar-envio',requireLogin,requireRole('transportista'), (req, res) => {
  const { rastreo, chofer, hospital, fecha_entrega } = req.body;

  const query = 'INSERT INTO envios (no_rastreo, id_chofer, hospital, fecha_entrega, fecha_envio) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP())';
  connection.query(query, [rastreo, chofer, hospital, fecha_entrega], (err, result) => {
    if (err) {
      return res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Error al guardar los datos en la base de datos.</h1>`);
    }
    res.send(`<link rel="stylesheet" href="/styles.css">
              <h1>Envio ${rastreo} guardado en la base de datos.</h1>`);
  });
});

// Ruta para mostrar los envios de la base de datos en formato HTML
app.get('/ver-envios',requireLogin, requireRole('transportista'), (req, res) => {
  connection.query('SELECT * FROM envios', (err, results) => {
    if (err) {
      return res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Error al obtener los datos.</h1>`);
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Envíos</title>
      </head>
      <body>
        <h1>Envíos Registrados</h1>
        <table>
          <thead>
            <tr>
              <th>No. de Rastreo</th>
              <th>ID del Envío</th>
              <th>ID del Chofer</th>
              <th>Hospital</th>
              <th>Fecha del envio</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(envio => {
      html += `
        <tr>
          <td>${envio.no_rastreo}</td>
          <td>${envio.id}</td>
          <td>${envio.id_chofer}</td>
          <td>${envio.hospital}</td>
          <td>${envio.fecha_envio}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
        <button onclick="window.location.href='/cuantos-equipos'">Número de Equipos según el Envío</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

//Ruta para obtener el número de equipos según en número de envio de la base de datos
app.get('/cuantos-equipos',requireLogin, requireRole('transportista'), (req, res) => {
  connection.query('SELECT envios.id AS no_envio, SUM(equipos.cantidad) AS num_equipos FROM equipos JOIN envios ON equipos.no_envio = envios.id GROUP BY envios.id', (err, results) => {
    if (err) {
      return res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Error al obtener los datos.</h1>`);
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Control de Equipos</title>
      </head>
      <body>
        <h1>Cantidad de Equipos Registrados según el Número de Envío</h1>
        <table>
          <thead>
            <tr>
              <th>No. de Envío</th>
              <th>No. de Equipos</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(envio => {
      html += `
        <tr>
          <td>${envio.no_envio}</td>
          <td>${envio.num_equipos}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

app.post('/upload-envio', upload.single('excelFile'),requireLogin, requireRole('transportista'), (req, res) => {
  const filePath = req.file.path;
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  data.forEach(row => {
    const { no_rastreo, id_chofer, hospital, fecha_entrega} = row;
    const sql = `INSERT INTO envios (no_rastreo, id_chofer, hospital, fecha_entrega, fecha_envio) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP())`;
    connection.query(sql, [no_rastreo, id_chofer, hospital, fecha_entrega], err => {
      if (err) throw err;
    });
  });

  res.send(`<link rel="stylesheet" href="/styles.css">
            <h1>Archivo cargado y datos guardados</h1>`);
});

app.get('/download-envio', requireLogin, requireRole('transportista'), (req, res) => {
  const sql = `SELECT * FROM envios`;
  connection.query(sql, (err, results) => {
    if (err) throw err;  
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="envios.pdf"');
    const doc = new PDFDocument();
    doc.pipe(res);
    doc.text('Lista de envios', { align: 'center', underline: true });
    doc.moveDown(2);
    results.forEach((row) => {
      doc.text(`No. de rastreo: ${row.no_rastreo}`);
      doc.text(`Hospital: ${row.hospital}`);
      doc.text(`Fecha de envio: ${row.fecha_envio}`);
      doc.text(`Fecha de entrega: ${row.fecha_entrega}`);
      doc.text(`ID del chofer: ${row.id_chofer}`);
      doc.moveDown(1);
    });
    doc.end();
  });
});

//Ruta para editar los envios en la base de datos
app.post('/editar-envio', requireLogin, requireRole('transportista'), (req, res) => {
  const { rastreo, hospital, fecha_envio, fecha_entrega, id_chofer, id} = req.body;
  const query = 'UPDATE envios SET no_rastreo = ?, hospital = ?, fecha_envio = ?, fecha_entrega = ?, id_chofer = ? WHERE id = ?';
  connection.query(query, [rastreo, hospital, fecha_envio, fecha_entrega, id_chofer, id], (err, result) => {
    if(err){
      console.error(err);
      return res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Error al editar el envio en la base de datos.</h1>
                       <button onclick="window.location.href='/editar.html'">Volver</button>`);
    }
    res.redirect('/ver-envios');
  });
});

//Ruta para eliminar envios en la base de datos
app.post('/eliminar-envio',requireLogin,requireRole('transportista'), (req, res) => {
  const { rastreo, id } = req.body;
  const query = 'DELETE FROM envios WHERE no_rastreo = ? AND id = ?';
  connection.query(query, [rastreo, id], (err, result) => {
    if (err) {
      return res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Error al eliminar los datos en la base de datos.</h1>
                       <button onclick="window.location.href='/eliminar.html'">Volver</button>`);
    }
    res.send(`<link rel="stylesheet" href="/styles.css">
              <h1>Envio ${rastreo} eliminado en la base de datos.</h1>
              <button onclick="window.location.href='/eliminar.html'">Volver</button>`);
  });
});

// Ruta para guardar equipos en la base de datos
app.post('/insertar-equipos',requireLogin,requireRole('hospital'), (req, res) => {
  const { nombre, marca, cantidad, no_envio } = req.body;

  const query = 'INSERT INTO equipos (nombre, marca, cantidad, no_envio) VALUES (?, ?, ?, ?)';
  connection.query(query, [nombre, marca, cantidad, no_envio], (err, result) => {
    if (err) {
      return res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Error al guardar los datos en la base de datos.</h1>
                       <button onclick="window.location.href='/equipo.html'">Volver</button>`);
    }
    res.send(`<link rel="stylesheet" href="/styles.css">
              <h1>Equipo ${nombre} guardado en la base de datos.</h1>
              <button onclick="window.location.href='/equipo.html'">Volver</button>`);
  });
});

//Ruta para ver los equipos con una VISTA de la base de datos
app.get('/ver-equipos-vista',requireLogin, requireRole('transportista'), (req, res) => {
  connection.query('SELECT * FROM vista_equipos', (err, results) => {
    if (err) {
      return res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Error al obtener los datos.</h1>`);
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Equipos</title>
      </head>
      <body>
        <h1>Equipos filtrados según su fecha de entrega</h1>
        <table>
          <thead>
            <tr>
              <th>Fecha de entrega</th>
              <th>Marca</th>
              <th>Nombre</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(equipo => {
      html += `
        <tr>
          <td>${equipo.fecha_entrega}</td>
          <td>${equipo.marca}</td>
          <td>${equipo.nombre_equipo}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

//Ruta para ver los equipos de la base de datos
app.get('/ver-equipos',requireLogin, requireRole('hospital'), (req, res) => {
  connection.query('SELECT * FROM equipos', (err, results) => {
    if (err) {
      return res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Error al obtener los datos.</h1>`);
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Equipos</title>
      </head>
      <body>
        <h1>Equipos Registrados</h1>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>Marca</th>
              <th>Cantidad</th>
              <th>No. de envío</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(equipo => {
      html += `
        <tr>
          <td>${equipo.id}</td>
          <td>${equipo.nombre}</td>
          <td>${equipo.marca}</td>
          <td>${equipo.cantidad}</td>
          <td>${equipo.no_envio}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

app.post('/upload-equipo', upload.single('excelFile'),requireLogin, requireRole('hospital'), (req, res) => {
  const filePath = req.file.path;
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  data.forEach(row => {
    const { nombre, marca, cantidad, no_envio} = row;
    const sql = `INSERT INTO equipos (nombre, marca, cantidad, no_envio) VALUES (?, ?, ?, ?)`;
    connection.query(sql, [nombre, marca, cantidad, no_envio], err => {
      if (err) throw err;
    });
  });

  res.send(`<link rel="stylesheet" href="/styles.css">
            <h1>Archivo cargado y datos guardados</h1>`);
});

app.get('/download-equipo', requireLogin, requireRole('hospital'), (req, res) => {
  const sql = `SELECT * FROM equipos`;
  connection.query(sql, (err, results) => {
    if (err) throw err;  
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="equipos.pdf"');
    const doc = new PDFDocument();
    doc.pipe(res);
    doc.text('Lista de equipos', { align: 'center', underline: true });
    doc.moveDown(2);
    results.forEach((row) => {
      doc.text(`Nombre: ${row.nombre}`);
      doc.text(`Marca: ${row.marca}`);
      doc.text(`Cantidad: ${row.cantidad}`);
      doc.text(`No. de envío: ${row.no_envio}`);
      doc.moveDown(1);
    });
    doc.end();
  });
});

//Ruta para editar los equipos en la base de datos
app.post('/editar-equipo', requireLogin, requireRole('hospital'), (req, res) => {
  const { nombre, marca, cantidad, no_envio, id} = req.body;
  const query = 'UPDATE equipos SET nombre = ?, marca = ?, cantidad = ?, no_envio = ? WHERE id = ?';
  connection.query(query, [nombre, marca, cantidad, no_envio, id], (err, result) => {
    if(err){
      console.error(err);
      return res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Error al editar el equipo en la base de datos.</h1>
                       <button onclick="window.location.href='/editar.html'">Volver</button>`);
    }
    res.redirect('/ver-equipos');
  });
});

//Ruta para eliminar EQUIPOS en la base de datos
app.post('/eliminar-equipos',requireLogin,requireRole('hospital'), (req, res) => {
  const { nombre, id } = req.body;
  const query = 'DELETE FROM equipos WHERE nombre = ? AND id = ?';
  connection.query(query, [nombre, id], (err, result) => {
    if (err) {
      return res.send(`<link rel="stylesheet" href="/styles.css">
                       <h1>Error al eliminar los datos en la base de datos.</h1>
                       <button onclick="window.location.href='/eliminar.html'">Volver</button>`);
    }
    res.send(`<link rel="stylesheet" href="/styles.css">
              <h1>Equipo ${nombre} eliminado en la base de datos.</h1>
              <button onclick="window.location.href='/eliminar.html'">Volver</button>`);
  });
});

// Configuración de puerto
const PORT = process.env.PORT || 2000;
app.listen(PORT, () => console.log(`Servidor en funcionamiento en el puerto ${PORT}`));