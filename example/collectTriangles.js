import Stats from 'stats.js/src/Stats';
import * as dat from 'dat.gui';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree, CONTAINED, INTERSECTED, NOT_INTERSECTED } from '../src/index.js';
import "@babel/polyfill";

THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

const params = {
	size: 0.1,
	rotate: true,
};

let stats;
let scene, camera, renderer, controls;
let targetMesh, brushMesh;
let mouse = new THREE.Vector2();
let mouseType = - 1;
let lastTime;

function init() {

	const bgColor = 0x263238 / 2;

	// renderer setup
	renderer = new THREE.WebGLRenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setClearColor( bgColor, 1 );
	renderer.gammaOutput = true;
	document.body.appendChild( renderer.domElement );

	// scene setup
	scene = new THREE.Scene();
	scene.fog = new THREE.Fog( 0x263238 / 2, 20, 60 );

	const light = new THREE.DirectionalLight( 0xffffff, 0.5 );
	light.position.set( 1, 1, 1 );
	scene.add( light );
	scene.add( new THREE.AmbientLight( 0xffffff, 0.4 ) );

	// geometry setup
	const radius = 1;
	const tube = 0.4;
	const tubularSegments = 800;
	const radialSegments = 400;

	const knotGeometry = new THREE.TorusKnotBufferGeometry( radius, tube, tubularSegments, radialSegments ).toNonIndexed();
	const colorArray = new Uint8Array( knotGeometry.attributes.position.count * 3 );
	colorArray.fill( 255 );
	const colorAttr = new THREE.BufferAttribute( colorArray, 3, true );
	colorAttr.dynamic = true;
	knotGeometry.setAttribute( 'color', colorAttr );

	const knotMaterial = new THREE.MeshStandardMaterial( { color: 0xffffff, roughness: 0.3, metalness: 0, vertexColors: true } );
	targetMesh = new THREE.Mesh( knotGeometry, knotMaterial );
	targetMesh.geometry.computeBoundsTree();
	scene.add( targetMesh );

	const brushGeometry = new THREE.SphereBufferGeometry( 1, 40, 40 );
	const brushMaterial = new THREE.MeshStandardMaterial( {
		color: 0xEC407A,
		roughness: 0.75,
		metalness: 0,
		transparent: true,
		opacity: 0.5,
		premultipliedAlpha: true,
		emissive: 0xEC407A,
		emissiveIntensity: 0.5,
	} );

	brushMesh = new THREE.Mesh( brushGeometry, brushMaterial );
	scene.add( brushMesh );

	// camera setup
	camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 50 );
	camera.position.set( 3, 3, 3 );
	camera.far = 100;
	camera.updateProjectionMatrix();

	controls = new OrbitControls( camera, renderer.domElement );

	// stats setup
	stats = new Stats();
	document.body.appendChild( stats.dom );

	const gui = new dat.GUI();
	gui.add( params, 'size' ).min( 0.1 ).max( 1 ).step( 0.1 );
	gui.add( params, 'rotate' );
	gui.open();

	controls.addEventListener( 'start', function () {

		this.active = true;

	} );

	controls.addEventListener( 'end', function () {

		this.active = false;

	} );

	window.addEventListener( 'resize', function () {

		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();

		renderer.setSize( window.innerWidth, window.innerHeight );

	}, false );

	window.addEventListener( 'mousemove', function ( e ) {

		mouse.x = ( e.clientX / window.innerWidth ) * 2 - 1;
		mouse.y = - ( e.clientY / window.innerHeight ) * 2 + 1;

	} );

	window.addEventListener( 'mousedown', function ( e ) {

		mouseType = e.button;

	} );

	window.addEventListener( 'mouseup', function () {

		mouseType = - 1;

	} );

	window.addEventListener( 'contextmenu', function ( e ) {

		e.preventDefault();

	} );

	window.addEventListener( 'wheel', function ( e ) {

		let delta = e.deltaY;

		if ( e.deltaMode === 1 ) {

			delta *= 40;

		}

		if ( e.deltaMode === 2 ) {

			delta *= 40;

		}

		params.size += delta * 0.0005;
		params.size = Math.max( Math.min( params.size, 1 ), 0.1 );

		gui.updateDisplay();

	} );

	lastTime = window.performance.now();

}

function render() {

	requestAnimationFrame( render );

	stats.begin();

	const geometry = targetMesh.geometry;
	const bvh = geometry.boundsTree;
	const colorAttr = geometry.getAttribute( 'color' );
	const indexAttr = geometry.index;

	if ( controls.active ) {

		brushMesh.visible = false;

	} else {

		brushMesh.scale.setScalar( params.size );

		const raycaster = new THREE.Raycaster();
		raycaster.setFromCamera( mouse, camera );
		raycaster.firstHitOnly = true;

		const res = raycaster.intersectObject( targetMesh, true );
		if ( res.length ) {

			brushMesh.position.copy( res[ 0 ].point );
			controls.enabled = false;
			brushMesh.visible = true;

			const inverseMatrix = new THREE.Matrix4();
			inverseMatrix.copy( targetMesh.matrixWorld ).invert();

			const sphere = new THREE.Sphere();
			sphere.center.copy( brushMesh.position ).applyMatrix4( inverseMatrix );
			sphere.radius = params.size;

			const indices = [];
			const tempVec = new THREE.Vector3();
			bvh.shapecast(
				targetMesh,
				box => {

					const intersects = sphere.intersectsBox( box );
					const { min, max } = box;
					if ( intersects ) {

						for ( let x = 0; x <= 1; x ++ ) {

							for ( let y = 0; y <= 1; y ++ ) {

								for ( let z = 0; z <= 1; z ++ ) {

									tempVec.set(
										x === 0 ? min.x : max.x,
										y === 0 ? min.y : max.y,
										z === 0 ? min.z : max.z
									);
									if ( ! sphere.containsPoint( tempVec ) ) {

										return INTERSECTED;

									}

								}

							}

						}

						return CONTAINED;

					}

					return intersects ? INTERSECTED : NOT_INTERSECTED;

				},
				( tri, a, b, c, contained ) => {

					if ( contained || tri.intersectsSphere( sphere ) ) {

						indices.push( a, b, c );

					}

					return false;

				}
			);

			if ( mouseType === 0 || mouseType === 2 ) {

				let r = 255, g = 255, b = 255;
				if ( mouseType === 0 ) {

					r = 15;
					g = 78;
					b = 85;

				}

				for ( let i = 0, l = indices.length; i < l; i ++ ) {

					const i2 = indexAttr.getX( indices[ i ] );
					colorAttr.setX( i2, r );
					colorAttr.setY( i2, g );
					colorAttr.setZ( i2, b );

				}

				colorAttr.needsUpdate = true;

			}

		} else {

			controls.enabled = true;
			brushMesh.visible = false;

		}

	}

	const currTime = window.performance.now();
	if ( params.rotate ) {

		const delta = currTime - lastTime;
		targetMesh.rotation.y += delta * 0.001;

	}

	lastTime = currTime;

	renderer.render( scene, camera );
	stats.end();

}


init();
render();
