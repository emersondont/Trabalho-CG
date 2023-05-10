class Obj {
    constructor(obj, index) {
        this.objHref = obj.objHref;
        this.index = index;
        this.name = obj.name;
        this.textures = obj.textures;
        this.textureIndex = this.textures[0].index;
        this.cameraTarget;
        this.cameraPosition;
        this.yRotation = degToRad(0);
        this.xRotation = degToRad(0);

        this.targetAngleRadians = 100;
        this.targetRadius = 360;
        this.fieldOfViewRadians = degToRad(60);
        this.rotationSpeed = 4.2;
        this.cameraAngleRadians = Math.PI / 4;

        this.isAnimated = false; //se a animação está ligada

        this.a = 4; // raio horizontal
        this.b = 4; // raio vertical
        this.c = 4; // raio de profundidade
        this.t = 0; // parâmetro da curva

        this.animationCoords;
        this.indexCoordsCurve;

        this.translationLocation;
        this.objPosition = [0, 0, 0];

        this.insertHTML()
        this.buttonMeuCarrinhoHTML = document.getElementById("open-modal");

        this.arrowOrientationUp = true

        this.canvas = document.querySelector('#canvas' + String(index));
        this.gl = this.canvas.getContext("webgl2");
        if (!this.gl) {
            return;
        }
        twgl.setAttributePrefix("a_");
        this.meshProgramInfo = twgl.createProgramInfo(this.gl, [
            vertexShaderSource,
            fragmentShaderSource,
        ]);

        this.render = this.render.bind(this);

        this.main()
    }

    insertHTML() {
        var ulOptions = `<ul id="my-select${this.index}" class="horizontal-select">`

        this.textures.forEach((texture) => {
            texture.index == "1" ?
                ulOptions += `<li value="${texture.index}" id="op${texture.index}" class="selected" style="background-color: ${texture.inputColor}";></li>`
                :
                ulOptions += `<li value="${texture.index}" id="op${texture.index}" style="background-color: ${texture.inputColor}";></li>`
        })

        ulOptions += `</ul>`

        const card = `
        <div class="card">
            <div class="card-header">
                <h2>${this.name}</h2>
                <p>$49.99</p>
            </div>

            <canvas id="canvas${String(this.index)}"></canvas>
            <p class="arrow" id="arrow${String(this.index)}">▲</p>
            <div class="group" id="group${String(this.index)}">
                <div>
                    <p>Rotação Y</p>
                    <input type="range" min="0" max="360" id="roty${String(this.index)}" value="0">
                </div>

                <div>
                    <p>Rotação X</p>
                    <input type="range" min="0" max="720" id="rotx${String(this.index)}" value="0">
                </div>

                <div>
                    <p>Zoom</p>
                    <input type="range" min="0" max="40" id="zoom${String(this.index)}" value="0">
                </div>
            </div>

            ${ulOptions}

            <button class="button-cart" id="button-cart${String(this.index)}">Add to cart</button>
        </div>
    `
        const div = document.createElement('div');
        div.innerHTML = card.trim();

        const cardSection = document.getElementById('card-section');
        cardSection.appendChild(div.firstChild);

        //inputs range
        const zoom = document.getElementById('zoom' + String(this.index));
        zoom.addEventListener('input', () => {
            const val = ((parseInt(zoom.value) * -0.08) + 5.5)
            this.cameraPosition[2] = val
        });

        const rotY = document.getElementById('roty' + String(this.index));
        rotY.addEventListener('input', () => {
            const val = degToRad(parseInt(rotY.value))
            this.yRotation = val
        });

        const rotX = document.getElementById('rotx' + String(this.index));
        rotX.addEventListener('input', () => {
            const val = degToRad(parseInt(rotX.value))
            this.xRotation = val
        });


        //select texture
        var lis = document.querySelectorAll(`#my-select${this.index} li`);
        lis.forEach(li => {
            li.addEventListener('click', () => {
                lis.forEach(otherLi => {
                    otherLi.classList.remove('selected');
                });
                li.classList.add('selected');

                this.textureIndex = String(li.value)
                this.loadTexture()
            });
        });


        //button add to cart
        const buttonCart = document.getElementById('button-cart' + String(this.index));
        buttonCart.addEventListener('click', async () => {
            //objsCart.push(new objCart(this.objHref, this.index, this.textureIndex))
            await cart.newObj(this.objHref, this.textureIndex)
            this.buttonMeuCarrinhoHTML.innerHTML = `My cart(${cart.getCount()})`
        })

        const group = document.getElementById(`group${String(this.index)}`);
        group.className = 'group-hidden'

        const arrow = document.getElementById(`arrow${String(this.index)}`);
        arrow.addEventListener('click', () => {
            this.arrowOrientationUp =! this.arrowOrientationUp
            if(this.arrowOrientationUp) {
                arrow.textContent = '▲'
                group.className = 'group-hidden'
            }
            else {
                arrow.textContent = '▼'
                group.className = 'group'
            }
        })

        const canvasElement = document.getElementById(`canvas${String(this.index)}`);

        canvasElement.onmouseover = () => {
            this.isAnimated = true
        }

        canvasElement.onmouseleave = () => {
            this.isAnimated = false

            this.cameraPosition = m4.addVectors(this.cameraTarget, [
                0,
                0,
                this.radius,
            ]);
            this.t = 0;
        }
    }

    async main() {
        const response = await fetch(this.objHref);
        const text = await response.text();
        this.obj = parseOBJ(text);

        await this.loadTexture()

        const extents = this.getGeometriesExtents(this.obj.geometries);
        const range = m4.subtractVectors(extents.max, extents.min);
        // amount to move the object so its center is at the origin
        this.objOffset = m4.scaleVector(
            m4.addVectors(
                extents.min,
                m4.scaleVector(range, 0.5)),
            -1);

        // figure out how far away to move the camera so we can likely
        // see the object.
        this.radius = m4.length(range) * 0.5 * 4;
        this.c = this.radius
        this.cameraTarget = [0, 1, 0];
        this.cameraPosition = m4.addVectors(this.cameraTarget, [
            0,
            0,
            this.radius,
        ]);

        this.animationCoords = [
            [0, 0, this.radius],
            [2, 2, this.radius],
            [4, 4, this.radius / 2],
            [-2, 2, this.radius * (-1)],
            [-4, 0, (this.radius / 2) * (-1)],
            [-2, -2, (this.radius) * (-1)],
            [0, 0, this.radius]
        ];
        this.indexCoordsCurve = 0

        // Set zNear and zFar to something hopefully appropriate
        // for the size of this object.
        this.zNear = this.radius / 50;
        this.zFar = this.radius * 5;

        this.translationLocation = this.gl.getUniformLocation(this.meshProgramInfo.program, "u_translation")

        requestAnimationFrame(this.render)
    }

    async loadTexture() {
        const baseHref = new URL(this.objHref, window.location.href);
        const matTexts = await Promise.all(this.obj.materialLibs.map(async filename => {
            const matHref = new URL(filename, baseHref).href;
            const novaString = matHref.substring(0, matHref.indexOf('.mtl')) + this.textureIndex + '.mtl'
            const response = await fetch(novaString);
            return await response.text();
        }));
        this.materials = parseMTL(matTexts.join('\n'));

        const textures = {
            defaultWhite: twgl.createTexture(this.gl, { src: [255, 255, 255, 255] }),
            defaultNormal: twgl.createTexture(this.gl, { src: [127, 127, 255, 0] }),
        };

        // load texture for materials
        for (const material of Object.values(this.materials)) {
            Object.entries(material)
                .filter(([key]) => key.endsWith('Map'))
                .forEach(([key, filename]) => {
                    let texture = textures[filename];
                    if (!texture) {
                        const textureHref = new URL(filename, baseHref).href;
                        texture = twgl.createTexture(this.gl, { src: textureHref, flipY: true });
                        textures[filename] = texture;
                    }
                    material[key] = texture;
                });
        }

        // hack the materials so we can see the specular map
        Object.values(this.materials).forEach(m => {
            m.shininess = 25;
            m.specular = [3, 2, 1];
        });


        const defaultMaterial = {
            diffuse: [1, 1, 1],
            diffuseMap: textures.defaultWhite,
            normalMap: textures.defaultNormal,
            ambient: [0, 0, 0],
            specular: [1, 1, 1],
            specularMap: textures.defaultWhite,
            shininess: 400,
            opacity: 1,
        };

        this.parts = this.obj.geometries.map(({ material, data }) => {
            if (data.color) {
                if (data.position.length === data.color.length) {
                    // it's 3. The our helper library assumes 4 so we need
                    // to tell it there are only 3.
                    data.color = { numComponents: 3, data: data.color };
                }
            } else {
                // there are no vertex colors so just use constant white
                data.color = { value: [1, 1, 1, 1] };
            }

            // generate tangents if we have the data to do so.
            if (data.texcoord && data.normal) {
                data.tangent = generateTangents(data.position, data.texcoord);
            } else {
                // There are no tangents
                data.tangent = { value: [1, 0, 0] };
            }

            if (!data.texcoord) {
                data.texcoord = { value: [0, 0] };
            }

            if (!data.normal) {
                // we probably want to generate normals if there are none
                data.normal = { value: [0, 0, 1] };
            }

            // create a buffer for each array by calling
            // gl.createBuffer, gl.bindBuffer, gl.bufferData
            const bufferInfo = twgl.createBufferInfoFromArrays(this.gl, data);
            const vao = twgl.createVAOFromBufferInfo(this.gl, this.meshProgramInfo, bufferInfo);
            return {
                material: {
                    ...defaultMaterial,
                    ...this.materials[material],
                },
                bufferInfo,
                vao,
            };
        });
    }

    getExtents(positions) {
        const min = positions.slice(0, 3);
        const max = positions.slice(0, 3);
        for (let i = 3; i < positions.length; i += 3) {
            for (let j = 0; j < 3; ++j) {
                const v = positions[i + j];
                min[j] = Math.min(v, min[j]);
                max[j] = Math.max(v, max[j]);
            }
        }
        return { min, max };
    }

    getGeometriesExtents(geometries) {
        return geometries.reduce(({ min, max }, { data }) => {
            const minMax = this.getExtents(data.position);
            return {
                min: min.map((min, ndx) => Math.min(minMax.min[ndx], min)),
                max: max.map((max, ndx) => Math.max(minMax.max[ndx], max)),
            };
        }, {
            min: Array(3).fill(Number.POSITIVE_INFINITY),
            max: Array(3).fill(Number.NEGATIVE_INFINITY),
        });
    }

    render() {
        twgl.resizeCanvasToDisplaySize(this.gl.canvas);
        this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
        this.gl.enable(this.gl.DEPTH_TEST);

        const fieldOfViewRadians = degToRad(60);
        const aspect = this.gl.canvas.clientWidth / this.gl.canvas.clientHeight;
        const projection = m4.perspective(fieldOfViewRadians, aspect, this.zNear, this.zFar);

        const up = [0, 1, 0];

        if (this.isAnimated)
            this.animation()

        // Compute the camera's matrix using look at.
        const camera = m4.lookAt(this.cameraPosition, this.cameraTarget, up);
        //const camera = m4.lookAt(cameraPosition, this.objOffset, up);
        // Make a view matrix from the camera matrix.
        const view = m4.inverse(camera);

        const sharedUniforms = {
            u_lightDirection: m4.normalize([-1.5, 2, 2]),
            u_view: view,
            u_projection: projection,
            u_viewWorldPosition: this.cameraPosition
        };
        this.gl.useProgram(this.meshProgramInfo.program);

        // calls gl.uniform
        twgl.setUniforms(this.meshProgramInfo, sharedUniforms);

        // compute the world matrix once since all parts
        // are at the same space.
        let u_world = m4.identity();
        u_world = m4.translate(u_world, ...this.objOffset);
        u_world = m4.yRotation(this.yRotation);
        u_world = m4.multiply(m4.xRotation(this.xRotation), u_world);

        this.gl.uniform3f(this.translationLocation, this.objPosition[0], this.objPosition[1], this.objPosition[2]);

        for (const { bufferInfo, vao, material } of this.parts) {
            // set the attributes for this part.
            this.gl.bindVertexArray(vao);
            // calls gl.uniform
            twgl.setUniforms(this.meshProgramInfo, {
                u_world,
            }, material);
            // calls gl.drawArrays or gl.drawElements
            twgl.drawBufferInfo(this.gl, bufferInfo);
        }

        requestAnimationFrame(this.render)
    }

    animation() {
        //curva bezier
        const x = Math.pow(1 - this.t, 3) * this.animationCoords[this.indexCoordsCurve][0] + 3 * this.t * Math.pow(1 - this.t, 2) * this.animationCoords[this.indexCoordsCurve + 1][0] + 3 * Math.pow(this.t, 2) * (1 - this.t) * this.animationCoords[this.indexCoordsCurve + 2][0] + Math.pow(this.t, 3) * this.animationCoords[this.indexCoordsCurve + 3][0];
        const y = Math.pow(1 - this.t, 3) * this.animationCoords[this.indexCoordsCurve][1] + 3 * this.t * Math.pow(1 - this.t, 2) * this.animationCoords[this.indexCoordsCurve + 1][1] + 3 * Math.pow(this.t, 2) * (1 - this.t) * this.animationCoords[this.indexCoordsCurve + 2][1] + Math.pow(this.t, 3) * this.animationCoords[this.indexCoordsCurve + 3][1];
        const z = Math.pow(1 - this.t, 3) * this.animationCoords[this.indexCoordsCurve][2] + 3 * this.t * Math.pow(1 - this.t, 2) * this.animationCoords[this.indexCoordsCurve + 1][2] + 3 * Math.pow(this.t, 2) * (1 - this.t) * this.animationCoords[this.indexCoordsCurve + 2][2] + Math.pow(this.t, 3) * this.animationCoords[this.indexCoordsCurve + 3][2];

        this.cameraPosition[0] = x;
        this.cameraPosition[1] = y;
        this.cameraPosition[2] = z;

        this.t += 0.008

        if (this.t >= 1) {
            this.t = 0;
            if (this.indexCoordsCurve == 0)
                this.indexCoordsCurve = 3;
            else
                this.indexCoordsCurve = 0;
        }
    }
}

async function loadObjs() {
    const response = await fetch('src/obj.json');
    const text = await response.text();
    const objs = JSON.parse(text);

    const arrayObjs = []

    objs.forEach((obj, indice) => {
        arrayObjs.push(new Obj(obj, indice))
    })
}

var cart = new Cart();

loadObjs()
